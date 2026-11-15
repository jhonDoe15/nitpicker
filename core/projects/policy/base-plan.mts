import { existsSync } from 'node:fs';
import path from 'node:path';
import { runGit } from '../../diff/git/repository/command.mjs';
import { declaresProjects } from '../plan/enclosing.mts';
import { inspectRepository } from '../plan/inspect.mts';
import { canChangePlan, isPlanInput, withBaseTree as untypedWithBaseTree } from './base-tree.mjs';
import { messageOf } from '../../../shared/values/readers.mts';
import type { MonorepoPlan } from '../project-types.mts';

type BaseQuery = {
  readonly repositoryRoot: string;
  readonly prefix: string;
  readonly mergeBaseSha: string;
};

type BaseTree = { readonly root: string; readonly files: readonly string[] };

export type BasePlanResult = {
  readonly plan: MonorepoPlan | undefined;
  readonly error?: unknown;
};

const withBaseTree: <Result>(
  query: { readonly repositoryRoot: string; readonly mergeBaseSha: string },
  operation: (tree: BaseTree) => Result,
) => Result = untypedWithBaseTree;

function inspectedPlan(inspection: {
  readonly root: string;
  readonly files: readonly string[];
  readonly repositoryRoot: string;
}): BasePlanResult {
  try {
    return { plan: inspectRepository(inspection).plan };
  } catch (error) {
    return { plan: undefined, error };
  }
}

function changedOnDisk(repositoryRoot: string, mergeBaseSha: string): string[] {
  const untracked = runGit(repositoryRoot, ['ls-files', '--others', '--exclude-standard']);
  const addedOrDeleted = runGit(repositoryRoot, [
    'diff',
    '--name-only',
    '--no-renames',
    '--diff-filter=AD',
    mergeBaseSha,
  ]);
  return `${untracked}\n${addedOrDeleted}`.split('\n').filter(Boolean);
}

export function planInputsChanged({
  repositoryRoot,
  mergeBaseSha,
  changed,
}: Omit<BaseQuery, 'prefix'> & { readonly changed: readonly string[] }): boolean {
  return (
    changed.some(isPlanInput) || changedOnDisk(repositoryRoot, mergeBaseSha).some(canChangePlan)
  );
}

function atRepository(
  error: unknown,
  { tree, repositoryRoot }: { readonly tree: string; readonly repositoryRoot: string },
): Error {
  return new Error(messageOf(error).replaceAll(tree, repositoryRoot), { cause: error });
}

function underPrefix(files: readonly string[], prefix: string): readonly string[] {
  if (prefix === '.') {
    return files;
  }
  return files
    .filter((file) => file.startsWith(`${prefix}/`))
    .map((file) => file.slice(prefix.length + 1));
}

export function basePlanOf({ repositoryRoot, prefix, mergeBaseSha }: BaseQuery): BasePlanResult {
  return withBaseTree({ repositoryRoot, mergeBaseSha }, ({ root: tree, files }) => {
    const root = prefix === '.' ? tree : path.resolve(tree, prefix);
    if ((root !== tree && !root.startsWith(tree + path.sep)) || !existsSync(root)) {
      return { plan: undefined };
    }
    const inspected = inspectedPlan({
      root,
      files: underPrefix(files, prefix),
      repositoryRoot: tree,
    });
    return inspected.error === undefined
      ? inspected
      : { plan: undefined, error: atRepository(inspected.error, { tree, repositoryRoot }) };
  });
}

function baseText(repositoryRoot: string, sha: string, file: string): string {
  return runGit(repositoryRoot, ['show', `${sha}:${file}`]);
}

export function baseDeclaresProjects({ repositoryRoot, prefix, mergeBaseSha }: BaseQuery): boolean {
  const folder = prefix === '.' ? '' : `${prefix}/`;
  const listing = ['ls-tree', '--name-only', mergeBaseSha, ...(folder === '' ? [] : [folder])];
  const present = runGit(repositoryRoot, listing)
    .split('\n')
    .map((entry) => entry.slice(folder.length));
  return declaresProjects((file: string) =>
    present.includes(file) ? baseText(repositoryRoot, mergeBaseSha, `${folder}${file}`) : undefined,
  );
}
