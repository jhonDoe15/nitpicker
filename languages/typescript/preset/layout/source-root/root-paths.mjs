import path from 'node:path';
import { escapeRegExp } from '../../../../../shared/paths/glob.mjs';
import { depthFirst } from '../../../../../shared/traversal.mjs';

export const PROJECT_ROOT = '.';

export function normalizeRoot(root) {
  const segments = root
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.');
  return segments.length === 0 ? PROJECT_ROOT : segments.join('/');
}

export function isProjectRoot(root) {
  return root === PROJECT_ROOT;
}

export function underRoot(root, rest) {
  return isProjectRoot(root) ? rest : `${root}/${rest}`;
}

export function isInsideRoot(file, root) {
  return isProjectRoot(root) || file.startsWith(`${root}/`);
}

export function relativeToRoot(file, root) {
  return isProjectRoot(root) ? file : file.slice(root.length + 1);
}

export function rootPrefixPattern(roots) {
  return roots.map((root) => (isProjectRoot(root) ? '' : `${escapeRegExp(root)}/`)).join('|');
}

export function rootPattern(roots) {
  return roots.some(isProjectRoot)
    ? `(?:${rootPrefixPattern(roots)})`
    : `(?:${roots.map(escapeRegExp).join('|')})/`;
}

const CONFIG_BASENAMES = [
  '*.config.{js,cjs,mjs,ts,cts,mts}',
  '*.conf.{js,cjs}',
  '.*rc.{js,cjs,mjs,ts,json}',
  'Gruntfile.{js,cjs,mjs,ts}',
  'Gulpfile.{js,cjs,mjs,ts}',
  'gruntfile.{js,cjs,mjs,ts}',
  'gulpfile.{js,cjs,mjs,ts}',
  'babel.config.*',
  'jest.setup.*',
  'vitest.setup.*',
];
const ROOT_ONLY_OUTPUT = ['out', 'public', 'storybook-static', 'tmp', 'temp', '.git'];
const ROOT_SAMPLE_FOLDERS = ['examples', 'example', 'bench', 'benchmark', 'benchmarks', 'docs'];

export const PROJECT_ROOT_EXCLUDED_GLOBS = [
  '**/node_modules/**',
  '**/.*/**',
  ...CONFIG_BASENAMES,
  ...ROOT_ONLY_OUTPUT.map((folder) => `${folder}/**`),
  ...ROOT_SAMPLE_FOLDERS.map((folder) => `${folder}/**`),
];

const BRACE_GROUP = /\{([^{}]*)\}/u;

function braceOptions(glob) {
  const match = BRACE_GROUP.exec(glob);
  if (match === null) {
    return [];
  }
  const before = glob.slice(0, match.index);
  const after = glob.slice(match.index + match[0].length);
  return match[1].split(',').map((option) => `${before}${option}${after}`);
}

export function expandBraces(glob) {
  return [...depthFirst(glob, braceOptions)].filter((expanded) => !BRACE_GROUP.test(expanded));
}

export function sourcePathUnder(roots, file, cwd = process.cwd()) {
  const normalized = file.replaceAll('\\', '/');
  const named = roots.find((root) => !isProjectRoot(root) && normalized.includes(`/${root}/`));
  if (named !== undefined) {
    return normalized.slice(normalized.indexOf(`/${named}/`) + 1);
  }
  if (!(roots.some(isProjectRoot) && path.isAbsolute(file))) {
    return undefined;
  }
  const relative = path.relative(cwd, file).replaceAll('\\', '/');
  return relative === '' || relative.startsWith('..') || path.isAbsolute(relative)
    ? undefined
    : relative;
}

export function rootOf(roots, file) {
  const named = roots
    .filter((root) => !isProjectRoot(root) && isInsideRoot(file, root))
    .reduce((longest, root) => (root.length > longest.length ? root : longest), '');
  return named === '' ? roots.find((root) => isProjectRoot(root)) : named;
}

export function pathBelowRoot(roots, file) {
  const root = rootOf(roots, file);
  return root === undefined ? file : relativeToRoot(file, root);
}
