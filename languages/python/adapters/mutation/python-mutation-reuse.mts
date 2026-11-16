import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { insideProject } from '../../libraries/project-files.mts';
import { runGit as untypedRunGit } from '../../../../core/diff/git/repository/command.mjs';
import { diffFromBase } from '../../../../core/tooling/git/base-diff.mjs';
import { callUntyped as call } from '../../../../shared/values/boundaries/untyped-call.mts';
import { textOf } from '../../../../shared/values/readers.mts';
import { collectImports, importEdges } from '../analysis/python-coupling.mts';
import { testFileMatcher } from '../analysis/python-sources.mts';
import { META_SUFFIX, MUTANTS_DIRECTORY, metaFiles } from './python-mutation-data.mts';
import { run } from '../execution/python-process.mts';
import type { ImportsByFile, PythonModule } from '../analysis/typed/python-graph-types.mts';
import type { ToolContext } from '../typed/context/tool-context-types.mts';

type Change = { readonly status: string; readonly file: string; readonly prefix: string };
type GitRoots = { readonly baselineRoot: string; readonly projectRoot: string };
type GitListing =
  | { readonly listing: string; readonly prefix: string; readonly error?: undefined }
  | { readonly error: unknown; readonly listing?: undefined; readonly prefix?: undefined };
type Scanned = { readonly modules: PythonModule[]; readonly imports: ImportsByFile };
type StaleCheck = (file: string) => boolean;

const runGit: (root: string, args: string[]) => string = untypedRunGit;

const REUSABLE_STATUSES = ['M', 'A'];

function parseNameStatus(listing: string): { status: string; file: string }[] {
  const fields = listing.split('\0').filter((field) => field !== '');
  return fields.flatMap((field, index) =>
    index % 2 === 0 ? [{ status: field, file: fields[index + 1] ?? '' }] : [],
  );
}

function gitListing({ baselineRoot, projectRoot }: GitRoots): GitListing {
  try {
    return {
      listing: textOf(
        call(diffFromBase, {
          runGit,
          baselineRoot,
          projectRoot,
          args: ['--name-status', '--no-renames', '-z'],
          pathspec: ['--', ':/'],
        }),
      ),
      prefix: runGit(projectRoot, ['rev-parse', '--show-prefix']).trim(),
    };
  } catch (error) {
    return { error };
  }
}

function changesSinceBase(roots: GitRoots): Change[] | undefined {
  const { listing, prefix } = gitListing(roots);
  return listing === undefined
    ? undefined
    : parseNameStatus(listing).map((change) => ({ ...change, prefix }));
}

function isMutatedSourceChange(
  { status, file, prefix }: Change,
  { sourceRoots, isTest }: { sourceRoots: readonly string[]; isTest: (file: string) => boolean },
): boolean {
  if (!(REUSABLE_STATUSES.includes(status) && file.startsWith(prefix))) {
    return false;
  }
  const relative = file.slice(prefix.length);
  return (
    relative.endsWith('.py') &&
    !isTest(relative) &&
    sourceRoots.some((root) => root === '.' || relative.startsWith(`${root}/`))
  );
}

function importersOf(changedFiles: readonly string[], { modules, imports }: Scanned): Set<string> {
  const moduleOfFile = new Map(modules.map(({ file, module }) => [file, module]));
  const fileOfModule = new Map(modules.map(({ file, module }) => [module, file]));
  const importers = new Map<string, string[]>();
  for (const { source, target } of importEdges(modules, imports)) {
    importers.set(target, [...(importers.get(target) ?? []), source]);
  }
  const affected = new Set(changedFiles.flatMap((file) => moduleOfFile.get(file) ?? []));
  for (const module of affected) {
    for (const importer of importers.get(module) ?? []) {
      affected.add(importer);
    }
  }
  return new Set([...affected].flatMap((module) => fileOfModule.get(module) ?? []));
}

function scanOutcome(
  context: ToolContext,
): ({ kind: 'scanned' } & Scanned) | { kind: 'unreadable'; error: unknown } {
  try {
    return { kind: 'scanned', ...collectImports(context, run) };
  } catch (error) {
    return { kind: 'unreadable', error };
  }
}

function isStaleSource(context: ToolContext, changes: readonly Change[]): StaleCheck | undefined {
  if (changes.length === 0) {
    return () => false;
  }
  const scanned = scanOutcome(context);
  if (scanned.kind === 'unreadable') {
    return undefined;
  }
  const known = new Set(scanned.modules.map(({ file }) => file));
  const changed = changes.map(({ file, prefix }) => file.slice(prefix.length));
  if (!changed.every((file) => known.has(file))) {
    return undefined;
  }
  const affected = importersOf(changed, scanned);
  return (file) => !known.has(file) || affected.has(file);
}

function reusableChanges(
  {
    baselineRoot,
    projectRoot,
    project,
  }: Pick<ToolContext, 'projectRoot' | 'project'> & {
    baselineRoot: string;
  },
  baseMutants: string,
): Change[] | undefined {
  if (!existsSync(baseMutants)) {
    return undefined;
  }
  const changes = changesSinceBase({ baselineRoot, projectRoot });
  const isTest = testFileMatcher(projectRoot);
  const reusable = changes?.every((change) =>
    isMutatedSourceChange(change, { sourceRoots: project.sourceRoots, isTest }),
  );
  return reusable === true ? changes : undefined;
}

export function seedMutantsFromBase(context: ToolContext): boolean {
  const { snapshot, baselineRoot, projectRoot } = context;
  if (snapshot !== 'head' || baselineRoot === undefined) {
    return false;
  }
  const baseMutants = path.join(baselineRoot, MUTANTS_DIRECTORY);
  const changes = reusableChanges(
    { baselineRoot, projectRoot, project: context.project },
    baseMutants,
  );
  if (changes === undefined) {
    return false;
  }
  const isStale = isStaleSource(context, changes);
  if (isStale === undefined) {
    return false;
  }
  for (const file of metaFiles(baseMutants).filter((candidate) => !isStale(candidate))) {
    const target = insideProject(
      projectRoot,
      path.join(MUTANTS_DIRECTORY, `${file}${META_SUFFIX}`),
    );
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(insideProject(baseMutants, `${file}${META_SUFFIX}`), target);
  }
  return true;
}
