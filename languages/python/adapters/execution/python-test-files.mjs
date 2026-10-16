export const TEST_DIRECTORIES = ['tests', 'test'];
export const TEST_FILE_GLOBS = ['test_*.py', '*_test.py', 'tests.py', 'conftest.py'];

function globSource(glob) {
  return glob.replaceAll('.', String.raw`\.`).replaceAll('*', '[^/]*');
}

const NAMES = TEST_FILE_GLOBS.map(globSource).join('|');

export const TEST_FILE_NAME = new RegExp(`^(?:${NAMES})$`, 'u');
export const TEST_PATH = new RegExp(
  `(?:^|/)(?:(?:${TEST_DIRECTORIES.join('|')})/|(?:${NAMES})$)`,
  'u',
);

export function coverageTestOmits() {
  return [
    ...TEST_FILE_GLOBS.map((glob) => `*/${glob}`),
    ...TEST_DIRECTORIES.map((directory) => `*/${directory}/*`),
  ];
}

export function mutmutTestPatterns() {
  return [
    ...TEST_DIRECTORIES.flatMap((directory) => [`${directory}/*`, `*/${directory}/*`]),
    ...TEST_FILE_GLOBS.flatMap((glob) => [glob, `*/${glob}`]),
  ];
}

export function nonProductionTestGlobs() {
  return TEST_FILE_GLOBS.map((glob) => `**/${glob}`);
}
