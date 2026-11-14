import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  hasGradleSettings,
  includedBuilds,
} from '../../../../languages/java/builds/gradle-scripts/included-builds.mjs';
import { DEPENDENCY_MANIFESTS } from '../../../../languages/typescript/adapters/dependency-graph/package-managers/detect.mjs';
import { containedPath } from '../../../../shared/paths/contained-path.mjs';
import { addTemporaryWorktree } from '../../../diff/git/repository/worktree.mjs';
import { isInside } from '../../discovery/repository-files.mjs';
import { runRows } from './parallel-rows.mts';
import type { PlanProject, ProjectRow } from '../../project-types.mts';
import type { RunContext, SharedBase } from './project-rows.mts';

type AddedWorktree = {
  readonly worktreeRoot: string;
  readonly temporaryRoot: string;
  readonly remove: () => string | undefined;
};

const addWorktree: (
  repositoryRoot: string,
  request: { readonly commitSha: string; readonly directoryName: string },
) => AddedWorktree = addTemporaryWorktree;

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

async function releasedAfter<T>(results: Promise<T>, release: () => void): Promise<T> {
  try {
    return await results;
  } finally {
    release();
  }
}

function settled<T>(results: T | Promise<T>, release: () => void): T | Promise<T> {
  if (results instanceof Promise) {
    return releasedAfter(results, release);
  }
  release();
  return results;
}

function sharedBaseOf(
  added: AddedWorktree,
  commitSha: string,
  sharers: readonly PlanProject[],
): SharedBase {
  return {
    worktree: {
      root: added.worktreeRoot,
      commitSha,
      lockPath: path.join(added.temporaryRoot, 'dependencies.lock'),
    },
    sharers: new Set(sharers.map(({ path: folder }) => folder)),
  };
}

export function runRowsWithSharedBase(
  rows: readonly ProjectRow[],
  context: RunContext,
  repositoryRoot: string,
): readonly ProjectRow[] | Promise<readonly ProjectRow[]> {
  const commitSha = context.comparison.mergeBaseSha;
  const sharers = sharingProjects(rows, context.comparison.changed);
  if (context.cli.options.all || commitSha === undefined || sharers.length === 0) {
    return runRows(rows, context);
  }
  const added = addWorktree(repositoryRoot, { commitSha, directoryName: 'base' });
  function release(): void {
    const warning = added.remove();
    if (warning !== undefined) {
      context.cli.stderr.write(`nitpicker: ${warning}\n`);
    }
  }
  try {
    const sharedBase = sharedBaseOf(added, commitSha, sharers);
    return settled(runRows(rows, { ...context, sharedBase }), release);
  } catch (error) {
    release();
    throw error;
  }
}
