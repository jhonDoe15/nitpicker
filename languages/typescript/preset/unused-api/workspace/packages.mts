import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { projectFilePaths as untypedProjectFilePaths } from '../../../../../shared/project-files/project-files.mts';
import {
  fieldsOf,
  fieldOf,
  hasField,
  listOf,
  parseJson,
} from '../../../../../shared/values/readers.mts';
import { globMatcher as untypedGlobMatcher } from '../../layout.mts';
import { pnpmPackagePatterns } from './pnpm-workspace.mts';
import type { PackagesInfo, ProgramLayout, PublishableEntry } from './workspace-types.mts';

type PackageLayout = Pick<ProgramLayout, 'excludedGlobs'>;
type Manifest = {
  readonly name?: unknown;
  readonly private?: unknown;
  readonly workspaces?: unknown;
  readonly [field: string]: unknown;
};

const projectFilePaths: (
  root: string,
  options: { readonly skipDirectory: (absolute: string) => boolean },
) => string[] = untypedProjectFilePaths;
const globMatcher: (glob: string) => { test(value: string): boolean } = untypedGlobMatcher;

const PNPM_WORKSPACE = 'pnpm-workspace.yaml';
const MANIFEST = 'package.json';
const MAX_WORKSPACE_DEPTH = 4;
const PUBLISH_FIELDS = ['main', 'exports', 'bin', 'files', 'publishConfig'];

function readManifest(projectRoot: string): Manifest {
  try {
    return fieldsOf(parseJson(readFileSync(path.join(projectRoot, MANIFEST), 'utf8')));
  } catch {
    return {};
  }
}

function pnpmPatterns(directory: string): string[] {
  const file = path.join(directory, PNPM_WORKSPACE);
  return existsSync(file) ? pnpmPackagePatterns(readFileSync(file, 'utf8')) : [];
}

function manifestPatterns(directory: string): readonly unknown[] {
  const { workspaces } = readManifest(directory);
  return Array.isArray(workspaces) ? workspaces : listOf(fieldOf(workspaces, 'packages'));
}

function workspacePatterns(directory: string): string[] {
  return [...manifestPatterns(directory), ...pnpmPatterns(directory)]
    .filter((pattern) => typeof pattern === 'string')
    .map((pattern) => pattern.replace(/^(!?)\.\//u, '$1').replace(/\/$/u, ''));
}

function ancestorsUpToRepository(start: string): string[] {
  const directories = [start];
  for (const directory of directories) {
    const parent = path.dirname(directory);
    const isRepositoryRoot = existsSync(path.join(directory, '.git'));
    if (parent !== directory && !isRepositoryRoot) directories.push(parent);
  }
  return directories;
}

function isSkippedDirectory(relative: string, layout: PackageLayout): boolean {
  return (
    path.posix.basename(relative).startsWith('.') ||
    layout.excludedGlobs.some((glob) => path.posix.matchesGlob(`${relative}/x`, glob))
  );
}

function directoriesUnder(root: string, layout: PackageLayout): string[] {
  const manifests = projectFilePaths(root, {
    skipDirectory: (absolute) =>
      isSkippedDirectory(path.relative(root, absolute).split(path.sep).join('/'), layout),
  }).filter((file) => path.posix.basename(file) === MANIFEST);
  return [...new Set(manifests.map((file) => path.posix.dirname(file)))].filter(
    (directory) => directory !== '.' && directory.split('/').length <= MAX_WORKSPACE_DEPTH,
  );
}

function memberDirectories(root: string, layout: PackageLayout): string[] {
  const patterns = workspacePatterns(root);
  const included = patterns.filter((pattern) => !pattern.startsWith('!')).map(globMatcher);
  const excluded = patterns.filter((pattern) => pattern.startsWith('!'));
  const excludedMatchers = excluded.map((pattern) => globMatcher(pattern.slice(1)));
  return directoriesUnder(root, layout)
    .filter((relative) => included.some((matcher) => matcher.test(relative)))
    .filter((relative) => !excludedMatchers.some((matcher) => matcher.test(relative)))
    .map((relative) => path.join(root, relative));
}

function isPublished(manifest: Manifest): boolean {
  return manifest.private !== true && PUBLISH_FIELDS.some((field) => hasField(manifest, field));
}

function packageEntry(directory: string): PublishableEntry | undefined {
  const manifest = readManifest(directory);
  if (typeof manifest.name !== 'string') return undefined;
  return { dir: directory, name: manifest.name, manifest, published: isPublished(manifest) };
}

function workspaceRootOf(projectRoot: string): string | undefined {
  return ancestorsUpToRepository(projectRoot).find(
    (directory) => workspacePatterns(directory).length > 0,
  );
}

function packageLookup(
  longestFirst: readonly PublishableEntry[],
): (file: string) => PublishableEntry | undefined {
  return function packageOf(file) {
    return longestFirst.find(({ dir }) => file === dir || file.startsWith(`${dir}${path.sep}`));
  };
}

export function loadPackages(projectRoot: string, layout: PackageLayout): PackagesInfo {
  const root = workspaceRootOf(projectRoot);
  const members = root === undefined ? [] : memberDirectories(root, layout);
  const directories = [
    ...new Set([projectRoot, ...(root === undefined ? [] : [root]), ...members]),
  ];
  const packages = directories
    .map((directory) => packageEntry(directory))
    .filter((entry) => entry !== undefined);
  const longestFirst = packages.toSorted((left, right) => right.dir.length - left.dir.length);
  return { packages, packageOf: packageLookup(longestFirst) };
}
