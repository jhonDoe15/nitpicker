import { DJANGO_TEST_FILES } from '../configuration/pytest/collection-options.mjs';
import { TEST_DIRECTORIES, TOP_LEVEL_TEST_DIRECTORIES } from './python-project.mjs';

const STANDARD_TEST_FILES = ['test_*.py', '*_test.py', 'conftest.py'];

function globSource(glob) {
  return glob.replaceAll('.', String.raw`\.`).replaceAll('*', '[^/]*');
}

const NAMES = [...STANDARD_TEST_FILES, ...DJANGO_TEST_FILES].map(globSource).join('|');

export const TEST_FILE_NAME = new RegExp(`^(?:${NAMES})$`, 'u');

export function testFileGlobs(django) {
  return [...STANDARD_TEST_FILES, ...(django ? DJANGO_TEST_FILES : [])];
}

export function coverageTestOmits(django) {
  return [
    ...STANDARD_TEST_FILES.map((glob) => `*/${glob}`),
    ...TEST_DIRECTORIES.map((directory) => `*/${directory}/*`),
    ...TOP_LEVEL_TEST_DIRECTORIES.map((directory) => `${directory}/*`),
    ...(django ? DJANGO_TEST_FILES.map((glob) => `*/${glob}`) : []),
  ];
}

export function mutmutTestPatterns(django) {
  return [
    ...[...TEST_DIRECTORIES, ...TOP_LEVEL_TEST_DIRECTORIES].map((directory) => `${directory}/*`),
    ...TEST_DIRECTORIES.map((directory) => `*/${directory}/*`),
    ...testFileGlobs(django).flatMap((glob) => [glob, `*/${glob}`]),
  ];
}
