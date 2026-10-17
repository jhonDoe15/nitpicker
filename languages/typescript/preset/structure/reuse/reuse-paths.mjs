import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../../../../../shared/glob.mjs';
import { storyGlobs } from '../../eslint-config/scope-support.mjs';

export const NON_PRODUCTION_FOLDERS = new Set(['__mocks__', '__fixtures__', 'fixtures', 'stories']);
const STORY_FILES = storyGlobs.map(globToRegExp);

export function isNonProductionFolder(file) {
  return file.split('/').some((segment) => NON_PRODUCTION_FOLDERS.has(segment));
}

export function isReuseProductionPath(file) {
  return !isNonProductionFolder(file) && !STORY_FILES.some((pattern) => pattern.test(file));
}

function checkoutRoots(projectRoot) {
  const modules = path.join(projectRoot, 'node_modules');
  const linkedCheckout = existsSync(modules) ? [path.dirname(realpathSync(modules))] : [];
  return [path.resolve(projectRoot), realpathSync(projectRoot), ...linkedCheckout];
}

export function projectPathOf(projectRoot) {
  const roots = checkoutRoots(projectRoot);
  return (absolute) =>
    roots
      .map((root) => path.relative(root, absolute))
      .filter((relative) => !relative.startsWith('..') && !path.isAbsolute(relative))
      .map((relative) => relative.split(path.sep).join('/'))[0];
}
