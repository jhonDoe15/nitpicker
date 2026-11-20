import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { storyGlobs } from '../../eslint-config/scope-support.mts';
import { globMatcher as untypedGlobMatcher } from '../../layout.mts';

const NON_PRODUCTION_FOLDERS = new Set(['__mocks__', '__fixtures__', 'fixtures', 'stories']);
const globMatcher: (glob: string) => { test(file: string): boolean } = untypedGlobMatcher;
const STORY_FILES = storyGlobs.map(globMatcher);

export function nonProductionFolders(): string[] {
  return [...NON_PRODUCTION_FOLDERS];
}

export function isNonProductionFolder(file: string): boolean {
  return file.split('/').some((segment) => NON_PRODUCTION_FOLDERS.has(segment));
}

export function isReuseProductionPath(file: string): boolean {
  return !isNonProductionFolder(file) && !STORY_FILES.some((pattern) => pattern.test(file));
}

function checkoutRoots(projectRoot: string): string[] {
  const modules = path.join(projectRoot, 'node_modules');
  const linkedCheckout = existsSync(modules) ? [path.dirname(realpathSync(modules))] : [];
  return [path.resolve(projectRoot), realpathSync(projectRoot), ...linkedCheckout];
}

export function projectPathOf(projectRoot: string): (absolute: string) => string | undefined {
  const roots = checkoutRoots(projectRoot);
  return (absolute) =>
    roots
      .map((root) => path.relative(root, absolute))
      .filter((relative) => !relative.startsWith('..') && !path.isAbsolute(relative))
      .map((relative) => relative.split(path.sep).join('/'))[0];
}
