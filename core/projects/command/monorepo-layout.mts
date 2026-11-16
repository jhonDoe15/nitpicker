import { existsSync } from 'node:fs';
import path from 'node:path';
import { detectedPreset } from '../../configuration/project-checks/preset-detection.mjs';
import { inspectRepository } from '../plan/inspect.mts';
import { suggestedProjects } from '../plan/suggested-projects.mjs';
import { existingConfig } from '../../init/files/config-file.mts';
import type { Member, MonorepoLayout, ProjectEntry } from '../../init/monorepo/monorepo-types.mts';

type PlanMember = {
  readonly path: string;
  readonly folder?: string;
  readonly absolute: string;
  readonly preset: string;
  readonly overlay?: { readonly declared?: true } | undefined;
};

type Inspection = {
  readonly plan?: { readonly source: string; readonly projects: readonly PlanMember[] };
};

const inspect: (query: { readonly root: string; readonly repositoryRoot: string }) => Inspection =
  inspectRepository;
const suggested: (root: string) => readonly ProjectEntry[] = suggestedProjects;
const markerOf: (root: string) => unknown = detectedPreset;

function declaresPreset(absolute: string): boolean {
  const existing = existingConfig(absolute);
  return existing.kind === 'parsed' && existing.config['preset'] !== undefined;
}

function planMember(project: PlanMember): Member {
  const folder = project.folder ?? project.path;
  return {
    path: project.path,
    folder,
    absolute: project.absolute,
    preset: project.preset,
    declared: project.overlay?.declared === true || declaresPreset(project.absolute),
  };
}

function holdsNoProject(root: string): boolean {
  return markerOf(root) === undefined && !existsSync(path.join(root, 'package.json'));
}

export function monorepoLayout(root: string, repository: string): MonorepoLayout | undefined {
  const { plan } = inspect({ root, repositoryRoot: repository });
  if (plan !== undefined) {
    return { source: plan.source, members: plan.projects.map(planMember), entries: [] };
  }
  const entries = holdsNoProject(root) ? suggested(root) : [];
  if (entries.length === 0) {
    return undefined;
  }
  const members = entries.map(({ path: folder, preset }) => ({
    path: folder,
    folder,
    absolute: path.join(root, folder),
    preset,
    declared: true,
  }));
  return {
    source: 'suggested',
    members,
    entries: entries.map(({ path: p, preset }) => ({ path: p, preset })),
  };
}
