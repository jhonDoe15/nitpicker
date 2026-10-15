import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { configError } from '../../../shared/config.mjs';
import { globToRegExp } from '../../../shared/glob.mjs';

const DEFAULT_SOURCE_ROOTS = ['src'];
const DEFAULT_TEST_ROOTS = ['test', 'tests'];
const JSX_FILE = /\.[jt]sx$/u;
const HEAD_NAMES = new Set(['HEAD', '@']);

export function rejectHeadBase(base) {
  if (HEAD_NAMES.has(base)) {
    throw configError(
      `"base" cannot be "${base}": the change would be compared with itself. Name a branch such as "origin/main", or pass --base <ref>.`,
    );
  }
}

function jsxFiles(directory, relative) {
  const pending = [{ directory, relative }];
  const found = [];
  for (const folder of pending) {
    readFolder(folder, pending, found);
  }
  return found;
}

function readFolder(folder, pending, found) {
  for (const entry of readdirSync(folder.directory, { withFileTypes: true })) {
    const name = `${folder.relative}/${entry.name}`;
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      pending.push({ directory: path.join(folder.directory, entry.name), relative: name });
    }
    if (entry.isFile() && JSX_FILE.test(entry.name)) {
      found.push(name);
    }
  }
}

function existingJsxFiles(projectRoot, root) {
  const relative = root.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/$/u, '');
  const directory = path.join(projectRoot, relative);
  return existsSync(directory) ? jsxFiles(directory, relative) : [];
}

export function rejectUnreadableSources(config, projectRoot) {
  if (config.preset !== 'javascript') {
    return;
  }
  const roots = [
    ...(config.layout?.sourceRoots ?? DEFAULT_SOURCE_ROOTS),
    ...(config.layout?.testRoots ?? DEFAULT_TEST_ROOTS),
  ];
  const excluded = (config.exclude ?? []).map(globToRegExp);
  const found = roots
    .flatMap((root) => existingJsxFiles(projectRoot, root))
    .find((file) => !excluded.some((matcher) => matcher.test(file)));
  if (found !== undefined) {
    throw configError(
      `"preset": "javascript" does not analyze .jsx and .tsx files, and ${found} is one. Use "preset": "typescript", which reads them, or list the path in "exclude".`,
    );
  }
}
