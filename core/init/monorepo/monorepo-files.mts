import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { detectProject } from '../detection/detect-project.mts';
import { type ExistingConfig, existingConfig, placeConfig } from '../files/config-file.mts';
import { type Revision, placeFile } from '../files/place-file.mts';
import { planPeers } from '../peers/peer-plan.mts';
import type { PlacedFile } from '../init-report.mts';
import type { InitProject, Peers } from '../init-types.mts';
import type { Member, ProjectEntry } from './monorepo-types.mts';

export type MemberSetup = {
  readonly member: Member;
  readonly project?: InitProject;
  readonly peers?: Peers;
  readonly config?: PlacedFile;
  readonly error?: string;
};

const configName: string = CONFIG_FILE_NAME;
const NO_PROJECTS = 'It lists no projects, so a run here would not gate the projects below it.';

function renderProjects(config: Readonly<Record<string, unknown>>): string {
  return `${JSON.stringify(config, undefined, 2)}\n`;
}

function projectsRevision(
  existing: ExistingConfig,
  entries: readonly ProjectEntry[],
): Revision | undefined {
  const config = existing.kind === 'parsed' ? existing.config : {};
  if (config['projects'] !== undefined) {
    return undefined;
  }
  return { after: renderProjects({ ...config, projects: entries }), reason: NO_PROJECTS };
}

export function placeRootConfig(
  root: string,
  entries: readonly ProjectEntry[],
): PlacedFile | undefined {
  if (entries.length === 0) {
    return undefined;
  }
  const existing = existingConfig(root);
  return placeFile({
    root,
    relative: configName,
    content: renderProjects({ projects: entries }),
    revise: () => projectsRevision(existing, entries),
  });
}

function needsConfig(member: Member, project: InitProject): boolean {
  const settings = project.settings ?? {};
  const presetToWrite = !member.declared && project.preset !== member.preset;
  return member.path === member.folder && (presetToWrite || Object.keys(settings).length > 0);
}

function memberConfig(member: Member, project: InitProject): PlacedFile | undefined {
  if (!needsConfig(member, project)) {
    return undefined;
  }
  const placed = placeConfig(member.absolute, project.preset, project.settings);
  return { ...placed, relative: `${member.folder}/${placed.relative}` };
}

export function setUpMember(member: Member, nodeVersion: string): MemberSetup {
  let project: InitProject;
  try {
    project = detectProject(member.absolute);
  } catch (error) {
    return { member, error: error instanceof Error ? error.message : String(error) };
  }
  const peers = planPeers(member.absolute, project, nodeVersion);
  const config = memberConfig(member, project);
  return { member, project, peers, ...(config === undefined ? {} : { config }) };
}
