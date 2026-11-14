import { existsSync } from 'node:fs';
import path from 'node:path';
import { hasGradleSettings } from '../../../../languages/java/builds/gradle-scripts/included-builds.mjs';
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
const GRADLE_SCRIPTS = ['build.gradle', 'build.gradle.kts'];

function insideEnclosingBuild({ absolute }: PlanProject): boolean {
  const gradle = GRADLE_SCRIPTS.some((name) => existsSync(path.join(absolute, name)));
  return gradle && !hasSettings(absolute);
}

function holdsAnother(project: PlanProject, others: readonly PlanProject[]): boolean {
  return others.some((other) => other !== project && isInside(other.repoPath, project.repoPath));
}

export function sharingProjects(rows: readonly ProjectRow[]): readonly PlanProject[] {
  const selected = rows.filter(({ selection }) => selection.selected).map(({ project }) => project);
  const apart = selected.filter(
    (project) => !holdsAnother(project, selected) && !insideEnclosingBuild(project),
  );
  return apart.length < 2 ? [] : apart;
}

function settled<T>(results: T | Promise<T>, release: () => void): T | Promise<T> {
  if (results instanceof Promise) {
    return results.finally(release);
  }
  release();
  return results;
}

export function runRowsWithSharedBase(
  rows: readonly ProjectRow[],
  context: RunContext,
  repositoryRoot: string,
): readonly ProjectRow[] | Promise<readonly ProjectRow[]> {
  const commitSha = context.comparison.mergeBaseSha;
  const sharers = sharingProjects(rows);
  if (context.cli.options.all || commitSha === undefined || sharers.length === 0) {
    return runRows(rows, context);
  }
  const added = addWorktree(repositoryRoot, { commitSha, directoryName: 'base' });
  const release = (): void => {
    const warning = added.remove();
    if (warning !== undefined) {
      context.cli.stderr.write(`nitpicker: ${warning}\n`);
    }
  };
  const sharedBase: SharedBase = {
    worktree: {
      root: added.worktreeRoot,
      commitSha,
      lockPath: path.join(added.temporaryRoot, 'dependencies.lock'),
    },
    sharers: new Set(sharers.map(({ path: folder }) => folder)),
  };
  try {
    return settled(runRows(rows, { ...context, sharedBase }), release);
  } catch (error) {
    release();
    throw error;
  }
}
