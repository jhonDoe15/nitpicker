import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { runGit } from '../../diff/git/repository/command.mjs';
import { gitBlobId } from '../../policy-changes/policy-scope.mts';
import { isInside as untypedIsInside } from '../discovery/repository-files.mjs';

import type { Comparison, MonorepoPlan } from '../project-types.mts';

type Outside = { readonly file: string; readonly blob: string };
type BaseEntry = { readonly blob: string; readonly tail: string };
type BaseContext = { readonly plan: MonorepoPlan; readonly mergeBaseSha: string };

const isInside: (directory: string, parent: string) => boolean = untypedIsInside;

const EMPTY_BLOB = gitBlobId(Buffer.alloc(0));

function repositoryPathOf(prefix: string, folder: string): string {
  return path.posix.normalize(path.posix.join(prefix, folder));
}

function planRelative(prefix: string, file: string): string | undefined {
  if (prefix === '.') {
    return file;
  }
  return file.startsWith(`${prefix}/`) ? file.slice(prefix.length + 1) : undefined;
}

function contentOf(root: string, file: string): string | undefined {
  const full = path.resolve(root, file);
  if (!full.startsWith(root + path.sep)) {
    return undefined;
  }
  if (!(existsSync(full) && statSync(full).isFile())) {
    return undefined;
  }
  return gitBlobId(readFileSync(full));
}

function outsideFiles({
  plan,
  changed,
}: {
  readonly plan: MonorepoPlan;
  readonly changed: readonly string[];
}): readonly Outside[] {
  const folders = plan.projects.map(({ path: folder }) => folder);
  return changed
    .map((file) => planRelative(plan.prefix, file))
    .filter((file) => file !== undefined)
    .filter((file) => !folders.some((folder) => isInside(file, folder)))
    .flatMap((file): Outside[] => {
      const blob = contentOf(plan.root, file);
      return blob === undefined ? [] : [{ file, blob }];
    });
}

function baseEntries({ plan, mergeBaseSha }: BaseContext, folder: string): readonly BaseEntry[] {
  const location = repositoryPathOf(plan.prefix, folder);
  return runGit(plan.repositoryRoot, ['ls-tree', '-r', '-z', mergeBaseSha, '--', `${location}/`])
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      return {
        blob: line.slice(0, tab).split(' ').at(2) ?? '',
        tail: line.slice(tab + 1).slice(location.length + 1),
      };
    });
}

function reappears(entries: readonly BaseEntry[], outside: readonly Outside[]): boolean {
  const blobs = new Set(outside.map(({ blob }) => blob).filter((blob) => blob !== EMPTY_BLOB));
  return entries.some(
    ({ blob, tail }) =>
      blobs.has(blob) ||
      (tail.includes('/') && outside.some(({ file }) => file.endsWith(`/${tail}`))),
  );
}

export function reappearedProjects({
  plan,
  basePlan,
  comparison,
}: {
  readonly plan: MonorepoPlan;
  readonly basePlan: MonorepoPlan | undefined;
  readonly comparison: Pick<Comparison, 'changed' | 'mergeBaseSha'>;
}): ReadonlySet<string> {
  if (basePlan === undefined || comparison.mergeBaseSha === undefined) {
    return new Set<string>();
  }
  const current = new Set(plan.projects.map(({ path: folder }) => folder));
  const removed = basePlan.projects
    .map(({ path: folder }) => folder)
    .filter((folder) => folder !== '.' && !current.has(folder));
  const outside = removed.length === 0 ? [] : outsideFiles({ plan, changed: comparison.changed });
  if (outside.length === 0) {
    return new Set<string>();
  }
  const context = { plan, mergeBaseSha: comparison.mergeBaseSha };
  return new Set(removed.filter((folder) => reappears(baseEntries(context, folder), outside)));
}
