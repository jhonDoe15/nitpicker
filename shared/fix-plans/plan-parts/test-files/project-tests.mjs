import path from 'node:path';
import { languageOf } from '../source.mjs';

const TEST_SUFFIX = /\.(test|spec)\.[^.]+$/u;
const JVM_NAME = /(Tests?|IT|Spec)\.[^.]+$/u;
const PYTHON_TEST = /^test_.*\.py$|_test\.py$/u;
const JVM_TEST_FOLDER = /(^|\/)src\/[^/]*[tT]est\//u;
const TEST_FOLDERS = new Set(['test', 'tests', 'spec', 'specs']);
const IS_TEST = {
  typescript: (_file, name) => TEST_SUFFIX.test(name),
  java: (file, name) => JVM_TEST_FOLDER.test(file) && JVM_NAME.test(name),
  kotlin: (file, name) => JVM_TEST_FOLDER.test(file) && JVM_NAME.test(name),
  python: (_file, name) => PYTHON_TEST.test(name),
  go: (_file, name) => name.endsWith('_test.go'),
};

export function isTestFile(file) {
  const language = languageOf(file);
  return language !== undefined && IS_TEST[language](file, path.posix.basename(file));
}

export function withProjectIndex(env) {
  return { ...env, index: { texts: new Map(), memo: new Map() } };
}

function indexOf(env) {
  return env.index ?? withProjectIndex(env).index;
}

function listing(env) {
  const files = typeof env.files === 'function' ? env.files() : [];
  return { files, known: new Set(files), tests: files.filter(isTestFile) };
}

export function memoized(env, key, compute) {
  const { memo } = indexOf(env);
  if (!memo.has(key)) {
    memo.set(key, compute());
  }
  return memo.get(key);
}

export function projectFiles(env) {
  return memoized(env, 'project-files', () => listing(env));
}

export function textOf(env, file) {
  const { texts } = indexOf(env);
  if (!texts.has(file)) {
    texts.set(file, env.read(file) ?? '');
  }
  return texts.get(file);
}

export function testRootOf(file) {
  const parts = path.posix.dirname(file).split('/');
  const at = parts.findIndex((part) => TEST_FOLDERS.has(part));
  return at === -1 ? undefined : parts.slice(0, at + 1).join('/');
}
