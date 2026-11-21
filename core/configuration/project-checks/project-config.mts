import { existsSync } from 'node:fs';
import path from 'node:path';
import { configError as untypedConfigError } from '../../../shared/config.mts';
import { pathInside as untypedPathInside } from '../../../shared/filesystem.mts';
import { globMatcher as untypedGlobMatcher } from '../../../shared/paths/glob.mts';
import { projectFilesUnder as untypedProjectFilesUnder } from '../../../shared/project-files/project-files.mts';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import { textsOf } from '../../../shared/values/readers.mts';
import {
  sourceRoots as defaultSourceRoots,
  testRoots as defaultTestRoots,
} from '../../../languages/typescript/preset/layout.mts';

const configError: (message: string) => Error = untypedConfigError;
const pathInside: (base: string, relative: string) => string | undefined = untypedPathInside;
const globMatcher: (glob: string) => { test: (file: string) => boolean } = untypedGlobMatcher;
const projectFilesUnder: (
  root: string,
  options: { skipDirectory: (directory: unknown, entry: { name: string }) => boolean },
) => string[] = untypedProjectFilesUnder;

const JSX_FILE = /\.[jt]sx$/u;
const TSX_FILE = /\.tsx$/u;
export const HEAD_NAMES = ['HEAD', '@'];

export function rejectHeadBase(base: string | undefined): void {
  if (base !== undefined && HEAD_NAMES.includes(base)) {
    throw configError(
      `"base" cannot be "${base}": the change would be compared with itself. Name a branch such as "origin/main", or pass --base <ref>.`,
    );
  }
}

function existingJsxFiles(projectRoot: string, root: string, pattern: RegExp): string[] {
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
    .filter((file) => pattern.test(file));
}

export function firstJsxFile(
  config: NitpickerConfig,
  projectRoot: string,
  pattern: RegExp = JSX_FILE,
): string | undefined {
  const roots = [
    ...(config.layout?.sourceRoots ?? defaultSourceRoots),
    ...textsOf(config.layout?.['testRoots'] ?? defaultTestRoots),
  ];
  const excluded = (config.exclude ?? []).map(globMatcher);
  return roots
    .flatMap((root) => existingJsxFiles(projectRoot, root, pattern))
    .find((file) => !excluded.some((matcher) => matcher.test(file)));
}

export function rejectUnreadableSources(config: NitpickerConfig, projectRoot: string): void {
  if (config.preset !== 'javascript') {
    return;
  }
  const found = firstJsxFile(config, projectRoot, TSX_FILE);
  if (found !== undefined) {
    throw configError(
      `"preset": "javascript" does not analyze .tsx files, and ${found} is one. Use "preset": "typescript", which reads them, or list the path in "exclude".`,
    );
  }
}
