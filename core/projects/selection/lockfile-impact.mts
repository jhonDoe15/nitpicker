import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runGit } from '../../diff/git/repository/command.mts';
import {
  readPyproject as untypedReadPyproject,
  parseToml as untypedParseToml,
} from '../../configuration/project-checks/uv-workspace.mts';
import { containedPath as untypedContainedPath } from '../../../shared/paths/contained-path.mjs';
import { escapeRegExp as untypedEscapeRegExp } from '../../../shared/paths/glob.mjs';
import { memoized as untypedMemoized } from '../../../shared/values/caching/memoized.mjs';
import { fieldOf, fieldsOf, isPlainObject, textOf } from '../../../shared/values/readers.mts';
import type { PlanProject } from '../project-types.mts';
import { isInside } from '../discovery/repository-files.mts';
import { textsUnder } from './scan/texts-under.mts';
import type { Lock } from './dependencies/lockfiles.mts';
import {
  changedPackages,
  closureOf,
  isLockfile,
  parseLockfile,
  pythonPackageName,
} from './dependencies/lockfiles.mts';

type ImpactProject = Pick<PlanProject, 'path' | 'preset' | 'absolute'> & {
  readonly repoPath?: string;
};
type Impact = Map<string, string>;
type Texts = readonly [string, string];
type Reached =
  | { readonly unknown: true; readonly hit?: undefined }
  | { readonly hit: string | undefined; readonly unknown?: undefined };
type ImpactRequest = {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly projects: readonly ImpactProject[];
};

const readPyproject: (directory: string) => unknown = untypedReadPyproject;
const parseToml: (text: string) => unknown = untypedParseToml;
const containedPath: (
  root: string,
  relative: string,
  options: { readonly outside: (folder: string) => string },
) => string = untypedContainedPath;
const memoized: <Key, Value>(compute: (key: Key) => Value) => (key: Key) => Value = untypedMemoized;

const escapeRegExp: (text: string) => string = untypedEscapeRegExp;

const CATALOG = /(?:^|\/)gradle\/libs\.versions\.toml$/u;
const MANIFEST_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const GRADLE_BUILD = /\.gradle(?:\.kts)?$/u;
const SKIPPED_FOLDERS = new Set(['build', 'target', 'out', 'node_modules']);

function baseText(repositoryRoot: string, mergeBaseSha: string, file: string): string | undefined {
  const listed = runGit(repositoryRoot, [
    'ls-tree',
    '--name-only',
    mergeBaseSha,
    '--',
    file,
  ]).trim();
  return listed === '' ? undefined : runGit(repositoryRoot, ['show', `${mergeBaseSha}:${file}`]);
}

function headText(repositoryRoot: string, file: string): string | undefined {
  const full = containedPath(repositoryRoot, file, {
    outside: (relative: string) => `${relative} is outside the repository`,
  });
  return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
}

function manifestNames(directory: string): string[] | undefined {
  const file = path.join(directory, 'package.json');
  if (!existsSync(file)) {
    return undefined;
  }
  const manifest: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return MANIFEST_FIELDS.flatMap((field) => {
    const table = fieldOf(manifest, field);
    return isPlainObject(table) ? Object.keys(table) : [];
  });
}

function directNeeds(project: ImpactProject, lock: Lock): string[] | undefined {
  if (project.preset === 'python') {
    const name = fieldOf(fieldOf(readPyproject(project.absolute), 'project'), 'name');
    return name === undefined ? undefined : [...(lock.edges.get(pythonPackageName(name)) ?? [])];
  }
  return manifestNames(project.absolute);
}

const SCRIPT_PRESETS = new Set(['typescript', 'javascript']);

function usesLockfile(file: string, project: ImpactProject): boolean {
  const fits =
    path.posix.basename(file) === 'uv.lock'
      ? project.preset === 'python'
      : SCRIPT_PRESETS.has(project.preset);
  return fits && isInside(project.repoPath ?? project.path, path.posix.dirname(file));
}

function changeReached(
  project: ImpactProject,
  { head, changed }: { readonly head: Lock; readonly changed: Impact },
): Reached {
  const direct = directNeeds(project, head);
  if (direct === undefined) {
    return { unknown: true };
  }
  return { hit: [...closureOf(head, direct)].find((name) => changed.has(name)) };
}

function lockImpact(
  file: string,
  texts: Texts,
  everyProject: readonly ImpactProject[],
): Impact | undefined {
  const projects = everyProject.filter((project) => usesLockfile(file, project));
  const base = parseLockfile(file, texts[0]).lock;
  const head = parseLockfile(file, texts[1]).lock;
  if (base === undefined || head === undefined) {
    return undefined;
  }
  const changed = changedPackages(base, head);
  if (changed.size === 0) {
    return undefined;
  }
  const reached = projects.map((project): [ImpactProject, Reached] => [
    project,
    changeReached(project, { head, changed }),
  ]);
  if (reached.some(([, { unknown }]) => unknown === true)) {
    return undefined;
  }
  return new Map(
    reached.flatMap(([project, { hit }]): [string, string][] =>
      hit === undefined
        ? []
        : [[project.path, `${path.posix.basename(file)}: ${textOf(changed.get(hit))}`]],
    ),
  );
}

function accessors(
  prefix: string,
  table: unknown,
  valueOf: (entry: unknown) => unknown,
): [string, string][] {
  return Object.entries(fieldsOf(table)).map(([alias, entry]): [string, string] => [
    `${prefix}.${alias.replaceAll(/[-_]/gu, '.')}`,
    JSON.stringify(valueOf(entry)),
  ]);
}

function catalogEntries(text: string): [string, string][] {
  const catalog = parseToml(text);
  const versions = fieldsOf(fieldOf(catalog, 'versions'));
  const libraries = fieldsOf(fieldOf(catalog, 'libraries'));
  function resolved(entry: unknown): unknown {
    if (!isPlainObject(entry)) {
      return entry;
    }
    const ref = fieldOf(fieldOf(entry, 'version'), 'ref');
    return ref === undefined ? entry : { ...entry, version: versions[textOf(ref)] };
  }
  function bundled(aliases: unknown): unknown {
    return Array.isArray(aliases)
      ? aliases.map((alias: unknown) => resolved(libraries[textOf(alias)]))
      : aliases;
  }
  return [
    ...accessors('libs', libraries, resolved),
    ...accessors('libs.plugins', fieldOf(catalog, 'plugins'), resolved),
    ...accessors('libs.bundles', fieldOf(catalog, 'bundles'), bundled),
    ...accessors('libs.versions', versions, (version) => version),
  ];
}

function buildText(directory: string): string {
  return textsUnder(directory, { skipped: SKIPPED_FOLDERS, accepts: GRADLE_BUILD }).join('\n');
}

function catalogImpact(file: string, texts: Texts, projects: readonly ImpactProject[]): Impact {
  const base = new Map(catalogEntries(texts[0]));
  const head = new Map(catalogEntries(texts[1]));
  const changed = [...new Set([...base.keys(), ...head.keys()])].filter(
    (accessor) => base.get(accessor) !== head.get(accessor),
  );
  const impact: Impact = new Map();
  for (const project of projects) {
    const text = buildText(project.absolute);
    const hit = changed.find((accessor) =>
      new RegExp(`\\b${escapeRegExp(accessor)}\\b`, 'u').test(text),
    );
    if (hit !== undefined) {
      impact.set(project.path, `${path.posix.basename(file)}: ${hit}`);
    }
  }
  return impact;
}

function weigh(
  file: string,
  texts: Texts,
  projects: readonly ImpactProject[],
): { readonly impact: Impact | undefined; readonly unreadable?: unknown } {
  try {
    return {
      impact: CATALOG.test(file)
        ? catalogImpact(file, texts, projects)
        : lockImpact(file, texts, projects),
    };
  } catch (error) {
    return { impact: undefined, unreadable: error };
  }
}

function impactOf(
  file: string,
  { repositoryRoot, mergeBaseSha, projects }: ImpactRequest,
): Impact | undefined {
  if (!(CATALOG.test(file) || isLockfile(file))) {
    return undefined;
  }
  const base = baseText(repositoryRoot, mergeBaseSha, file);
  const head = headText(repositoryRoot, file);
  return base === undefined || head === undefined
    ? undefined
    : weigh(file, [base, head], projects).impact;
}

export function lockfileImpact(request: ImpactRequest): (file: string) => Impact | undefined {
  return memoized((file) => impactOf(file, request));
}
