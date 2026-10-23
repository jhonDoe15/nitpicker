import { existsSync } from 'node:fs';
import path from 'node:path';
import { configError } from '../../../shared/config.mjs';
import { pathInside } from '../../../shared/filesystem.mjs';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { projectFilesUnder } from '../../../shared/project-files/project-files.mjs';
import {
  sourceRoots as defaultSourceRoots,
  testRoots as defaultTestRoots,
} from '../../../languages/typescript/preset/layout.mjs';

const JSX_FILE = /\.[jt]sx$/u;
const HEAD_NAMES = new Set(['HEAD', '@']);

export function rejectHeadBase(base) {
  if (HEAD_NAMES.has(base)) {
    throw configError(
      `"base" cannot be "${base}": the change would be compared with itself. Name a branch such as "origin/main", or pass --base <ref>.`,
    );
  }
}

function existingJsxFiles(projectRoot, root) {
  const directory = pathInside(projectRoot, root);
  if (directory === undefined || !existsSync(directory)) {
    return [];
  }
  return [
    ...projectFilesUnder(directory, {
      skipDirectory: (_absolute, entry) => entry.name === 'node_modules',
    }),
  ]
    .map((file) => path.relative(projectRoot, file).replaceAll('\\', '/'))
    .filter((file) => JSX_FILE.test(file));
}

export function rejectUnreadableSources(config, projectRoot) {
  if (config.preset !== 'javascript') {
    return;
  }
  const roots = [
    ...(config.layout?.sourceRoots ?? defaultSourceRoots),
    ...(config.layout?.testRoots ?? defaultTestRoots),
  ];
  const excluded = (config.exclude ?? []).map(globMatcher);
  const found = roots
    .flatMap((root) => existingJsxFiles(projectRoot, root))
    .find((file) => !excluded.some((matcher) => matcher.test(file)));
  if (found !== undefined) {
    throw configError(
      `"preset": "javascript" does not analyze .jsx and .tsx files, and ${found} is one. Use "preset": "typescript", which reads them, or list the path in "exclude".`,
    );
  }
}
