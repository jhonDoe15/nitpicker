import { existsSync } from 'node:fs';
import path from 'node:path';
import { runGit } from '../../diff/git/repository/command.mts';
import { inspectRepository } from '../plan/inspect.mts';
import { canChangePlan, isPlanInput, withBaseTree as untypedWithBaseTree } from './base-tree.mts';
import type { MonorepoPlan } from '../project-types.mts';

type BaseQuery = {
  readonly repositoryRoot: string;
  readonly prefix: string;
  readonly mergeBaseSha: string;
};

type BaseTree = { readonly root: string; readonly files: readonly string[] };

export type BasePlanResult = { readonly plan: MonorepoPlan | undefined };

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
  } catch {
    return { plan: undefined };
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
    return inspectedPlan({ root, files: underPrefix(files, prefix), repositoryRoot: tree });
  });
}
