import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { projectFilePaths } from '../../../../shared/project-files/project-files.mjs';
import { DJANGO_TEST_FILES } from '../configuration/pytest/collection-options.mts';
import {
  ROOT_TEST_DIRECTORIES,
  TEST_DIRECTORIES,
  TOP_LEVEL_TEST_DIRECTORIES,
} from './python-project.mts';

const STANDARD_TEST_FILES = ['test_*.py', '*_test.py', 'conftest.py'];

function globSource(glob: string): string {
  return glob.replaceAll('.', String.raw`\.`).replaceAll('*', '[^/]*');
}

const NAMES = [...STANDARD_TEST_FILES, ...DJANGO_TEST_FILES].map(globSource).join('|');

const TEST_FILE_NAME = new RegExp(`^(?:${NAMES})$`, 'u');

export function testFileGlobs({ django }: { readonly django: boolean }): string[] {
  return [...STANDARD_TEST_FILES, ...(django ? DJANGO_TEST_FILES : [])];
}

export function coverageTestOmits({ django }: { readonly django: boolean }): string[] {
  return [
    ...STANDARD_TEST_FILES.map((glob) => `*/${glob}`),
    ...TEST_DIRECTORIES.map((directory) => `*/${directory}/*`),
    ...TOP_LEVEL_TEST_DIRECTORIES.map((directory) => `${directory}/*`),
    ...(django ? DJANGO_TEST_FILES.map((glob) => `*/${glob}`) : []),
  ];
}

export function mutmutTestPatterns({ django }: { readonly django: boolean }): string[] {
  return [
    ...[...TEST_DIRECTORIES, ...TOP_LEVEL_TEST_DIRECTORIES].map((directory) => `${directory}/*`),
    ...TEST_DIRECTORIES.map((directory) => `*/${directory}/*`),
    ...testFileGlobs({ django }).flatMap((glob) => [glob, `*/${glob}`]),
  ];
}

const filePaths: (
  root: string,
  options: { skipDirectory: (absolute: string) => boolean },
) => string[] = projectFilePaths;

function isTestScope(file: string): boolean {
  const parts = file.split('/');
  const inTestDirectory = parts.length > 1 && ROOT_TEST_DIRECTORIES.includes(parts[0] ?? '');
  return (parts.length === 1 || inTestDirectory) && TEST_FILE_NAME.test(parts.at(-1) ?? '');
}

export function existingTestFiles(projectRoot: string): string[] {
  const top = path.resolve(projectRoot);
  return filePaths(top, {
    skipDirectory: (absolute: string) =>
      path.dirname(absolute) === top && !ROOT_TEST_DIRECTORIES.includes(path.basename(absolute)),
  }).filter((file: string) => isTestScope(file));
}

const UNITTEST_FILE = /^test.*\.py$/u;

function holdsUnittestFiles(directory: string): boolean {
  return readdirSync(directory, { recursive: true }).some((file) =>
    UNITTEST_FILE.test(path.basename(String(file))),
  );
}

export function startDirectory(projectRoot: string, name: string): boolean {
  const directory = path.resolve(projectRoot, name);
  if (!directory.startsWith(`${projectRoot}${path.sep}`)) {
    return false;
  }
  return (
    existsSync(directory) &&
    (!TOP_LEVEL_TEST_DIRECTORIES.includes(name) || holdsUnittestFiles(directory))
  );
}
