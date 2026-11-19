import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  hasGradleSettings,
  includedBuilds,
} from '../../../../languages/java/builds/gradle-scripts/included-builds.mjs';
import { DEPENDENCY_MANIFESTS } from '../../../../languages/typescript/adapters/dependency-graph/package-managers/detect.mts';
import { containedPath } from '../../../../shared/paths/contained-path.mjs';
import { isInside } from '../../discovery/repository-files.mjs';
import { runRows } from './parallel-rows.mts';
import { sharedCheckout, sharedWorktreeOf, withSharedHead } from './shared-head.mts';
import type { PlanProject, ProjectRow } from '../../project-types.mts';
import type { RunContext } from './project-rows.mts';

const hasSettings: (directory: string) => boolean = hasGradleSettings;
const includedOf: (directory: string) => readonly string[] = includedBuilds;
const dependencyManifests: ReadonlySet<string> = new Set<string>(DEPENDENCY_MANIFESTS);
const GRADLE_SCRIPTS = ['build.gradle', 'build.gradle.kts'];

function insideEnclosingBuild({ absolute }: PlanProject): boolean {
  function outside(relative: string): string {
    return `${relative} leaves ${absolute}`;
  }
  const gradle = GRADLE_SCRIPTS.some((name) =>
    existsSync(containedPath(absolute, name, { outside })),
  );
  return gradle && !hasSettings(absolute);
}

function buildsOutside({ absolute }: PlanProject): boolean {
  return includedOf(absolute).some((written) => {
    const folder = path.posix.normalize(written.replaceAll('\\', '/'));
    return folder.startsWith('..') || path.isAbsolute(written);
  });
}

function changesDependencies(changed: readonly string[]): boolean {
  return changed.some((file) => dependencyManifests.has(path.posix.basename(file)));
}

function holdsAnother(project: PlanProject, others: readonly PlanProject[]): boolean {
  return others.some((other) => other !== project && isInside(other.repoPath, project.repoPath));
}

export function sharingProjects(
  rows: readonly ProjectRow[],
  changed: readonly string[],
): readonly PlanProject[] {
  if (changesDependencies(changed)) {
    return [];
  }
  const selected = rows.filter(({ selection }) => selection.selected).map(({ project }) => project);
  const apart = selected.filter(
    (project) =>
      !(holdsAnother(project, selected) || insideEnclosingBuild(project) || buildsOutside(project)),
  );
  return apart.length < 2 ? [] : apart;
}

function withSharedBase(
  rows: readonly ProjectRow[],
  context: RunContext,
  repositoryRoot: string,
): readonly ProjectRow[] | Promise<readonly ProjectRow[]> {
  const commitSha = context.comparison.mergeBaseSha;
  const sharers = sharingProjects(rows, context.comparison.changed);
  if (context.cli.options.all || commitSha === undefined || sharers.length === 0) {
    return runRows(rows, context);
  }
  return sharedCheckout({ repositoryRoot, commitSha, directoryName: 'base' }, context, (added) =>
    runRows(rows, { ...context, sharedBase: sharedWorktreeOf(added, commitSha, sharers) }),
  );
}

export function runRowsWithSharedBase(
  rows: readonly ProjectRow[],
  context: RunContext,
  repositoryRoot: string,
): readonly ProjectRow[] | Promise<readonly ProjectRow[]> {
  const sharers = sharingProjects(rows, []);
  return withSharedHead({ repositoryRoot, sharers }, context, (shared) =>
    withSharedBase(rows, shared, repositoryRoot),
  );
}
