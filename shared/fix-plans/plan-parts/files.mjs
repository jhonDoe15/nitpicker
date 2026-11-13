import path from 'node:path';
import { extensionOf, languageOf } from './source.mjs';

const TYPESCRIPT_EXTENSIONS = ['ts', 'mts', 'tsx', 'mjs', 'js', 'jsx', 'cts', 'cjs'];
const JVM_EXTENSIONS = ['java', 'kt'];
const TEST_SUFFIX = /\.(test|spec)(?=\.[^.]+$)/u;
const JVM_SUFFIX = /(Tests?|IT|Spec)(?=\.[^.]+$)/u;
const PYTHON_TEST = /^test_|_test(?=\.py$)/u;

function unique(items) {
  return [...new Set(items)];
}

function typescriptTests(file) {
  const { dir, name } = path.posix.parse(file);
  const extensions = unique([extensionOf(file), ...TYPESCRIPT_EXTENSIONS]);
  return extensions.flatMap((extension) =>
    ['test', 'spec'].flatMap((kind) => [
      path.posix.join(dir, `${name}.${kind}.${extension}`),
      path.posix.join(dir, '__tests__', `${name}.${kind}.${extension}`),
    ]),
  );
}

function jvmTests(file) {
  const { dir, name } = path.posix.parse(file);
  const folder = dir.replace(/(^|\/)src\/main\//u, '$1src/test/');
  return JVM_EXTENSIONS.flatMap((extension) =>
    ['Test', 'Tests', 'IT'].map((suffix) =>
      path.posix.join(folder, `${name}${suffix}.${extension}`),
    ),
  );
}

const TESTS_FOLDER = 'tests';

function pythonTests(file) {
  const { dir, name } = path.posix.parse(file);
  const root = dir.split('/')[0] ?? '';
  const inner = dir.split('/').slice(1).join('/');
  return [
    path.posix.join(dir, `test_${name}.py`),
    path.posix.join(dir, `${name}_test.py`),
    path.posix.join(TESTS_FOLDER, `test_${name}.py`),
    path.posix.join(TESTS_FOLDER, inner, `test_${name}.py`),
    path.posix.join(root, TESTS_FOLDER, `test_${name}.py`),
  ];
}

function goTests(file) {
  const { dir, name } = path.posix.parse(file);
  return [path.posix.join(dir, `${name}_test.go`)];
}

const CANDIDATES = {
  typescript: typescriptTests,
  java: jvmTests,
  kotlin: jvmTests,
  python: pythonTests,
  go: goTests,
};

export function testFileCandidates(file) {
  const language = languageOf(file);
  return language === undefined ? [] : unique(CANDIDATES[language](file).map(path.posix.normalize));
}

export function nearestTestFile(file, exists) {
  const candidates = testFileCandidates(file);
  const found = candidates.find((candidate) => exists(candidate));
  if (found !== undefined) {
    return { path: found, exists: true };
  }
  return candidates.length === 0 ? undefined : { path: candidates[0], exists: false };
}

function subjectCandidates(testFile) {
  const { dir, name, ext } = path.posix.parse(testFile);
  const language = languageOf(testFile);
  if (language === 'python') {
    const bare = `${name}${ext}`.replace(PYTHON_TEST, '');
    return [path.posix.join(dir.replace(/(^|\/)tests?(?=\/|$)/u, ''), bare)];
  }
  if (language === 'java' || language === 'kotlin') {
    const bare = `${name}${ext}`.replace(JVM_SUFFIX, '');
    const folder = dir.replace(/(^|\/)src\/test\//u, '$1src/main/');
    return JVM_EXTENSIONS.map((extension) =>
      path.posix.join(folder, `${bare.replace(/\.[^.]+$/u, '')}.${extension}`),
    );
  }
  if (language === 'go') {
    return [path.posix.join(dir, `${name.replace(/_test$/u, '')}.go`)];
  }
  const bare = `${name}${ext}`.replace(TEST_SUFFIX, '');
  const folder = dir.replace(/\/__tests__$/u, '');
  const stem = bare.replace(/\.[^.]+$/u, '');
  return TYPESCRIPT_EXTENSIONS.map((extension) => path.posix.join(folder, `${stem}.${extension}`));
}

export function subjectOfTest(testFile, exists) {
  return unique(subjectCandidates(testFile).map(path.posix.normalize)).find(
    (candidate) => candidate !== testFile && exists(candidate),
  );
}
