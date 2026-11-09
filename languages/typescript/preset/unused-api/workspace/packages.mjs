import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { projectFilePaths } from '../../../../../shared/project-files/project-files.mjs';
import { readManifest } from '../../eslint-config/scope-support.mjs';
import { globMatcher } from '../../layout.mjs';
import { pnpmPackagePatterns } from './pnpm-workspace.mjs';

const PNPM_WORKSPACE = 'pnpm-workspace.yaml';
const MANIFEST = 'package.json';
const MAX_WORKSPACE_DEPTH = 4;
const PUBLISH_FIELDS = ['main', 'exports', 'bin', 'files', 'publishConfig'];

function pnpmPatterns(directory) {
  const file = path.join(directory, PNPM_WORKSPACE);
  return existsSync(file) ? pnpmPackagePatterns(readFileSync(file, 'utf8')) : [];
}

function manifestPatterns(directory) {
  const { workspaces } = readManifest(directory);
  return Array.isArray(workspaces) ? workspaces : (workspaces?.packages ?? []);
}

function workspacePatterns(directory) {
  return [...manifestPatterns(directory), ...pnpmPatterns(directory)]
    .filter((pattern) => typeof pattern === 'string')
    .map((pattern) => pattern.replace(/^(!?)\.\//u, '$1').replace(/\/$/u, ''));
}

function ancestorsUpToRepository(start) {
  const directories = [start];
  for (const directory of directories) {
    const parent = path.dirname(directory);
    const isRepositoryRoot = existsSync(path.join(directory, '.git'));
    if (parent !== directory && !isRepositoryRoot) directories.push(parent);
  }
  return directories;
}

function isSkippedDirectory(relative, layout) {
  return (
    path.posix.basename(relative).startsWith('.') ||
    layout.excludedGlobs.some((glob) => path.posix.matchesGlob(`${relative}/x`, glob))
  );
}

function directoriesUnder(root, layout) {
  const manifests = projectFilePaths(root, {
    skipDirectory: (absolute) =>
      isSkippedDirectory(path.relative(root, absolute).split(path.sep).join('/'), layout),
  }).filter((file) => path.posix.basename(file) === MANIFEST);
  return [...new Set(manifests.map((file) => path.posix.dirname(file)))].filter(
    (directory) => directory !== '.' && directory.split('/').length <= MAX_WORKSPACE_DEPTH,
  );
}

function memberDirectories(root, layout) {
  const patterns = workspacePatterns(root);
  const included = patterns.filter((pattern) => !pattern.startsWith('!')).map(globMatcher);
  const excluded = patterns.filter((pattern) => pattern.startsWith('!'));
  const excludedMatchers = excluded.map((pattern) => globMatcher(pattern.slice(1)));
  return directoriesUnder(root, layout)
    .filter((relative) => included.some((matcher) => matcher.test(relative)))
    .filter((relative) => !excludedMatchers.some((matcher) => matcher.test(relative)))
    .map((relative) => path.join(root, relative));
}

function isPublished(manifest) {
  return manifest.private !== true && PUBLISH_FIELDS.some((field) => manifest[field] !== undefined);
}

function packageEntry(directory) {
  const manifest = readManifest(directory);
  if (typeof manifest.name !== 'string') return undefined;
  return { dir: directory, name: manifest.name, manifest, published: isPublished(manifest) };
}

function workspaceRootOf(projectRoot) {
  return ancestorsUpToRepository(projectRoot).find(
    (directory) => workspacePatterns(directory).length > 0,
  );
}

function packageLookup(longestFirst) {
  return function packageOf(file) {
    return longestFirst.find(({ dir }) => file === dir || file.startsWith(`${dir}${path.sep}`));
  };
}

/**
 * The named packages around a project: the project's own, its workspace root (up to the
 * repository root) and the workspace members. A package is published when its `package.json` has
 * a name, no `"private": true`, and says what it ships (`main`, `exports`, `bin`, `files` or
 * `publishConfig`).
 */
export function loadPackages(projectRoot, layout) {
  const root = workspaceRootOf(projectRoot);
  const members = root === undefined ? [] : memberDirectories(root, layout);
  const directories = [
    ...new Set([projectRoot, ...(root === undefined ? [] : [root]), ...members]),
  ];
  const packages = directories.map((directory) => packageEntry(directory)).filter(Boolean);
  const longestFirst = packages.toSorted((left, right) => right.dir.length - left.dir.length);
  return { packages, packageOf: packageLookup(longestFirst) };
}
