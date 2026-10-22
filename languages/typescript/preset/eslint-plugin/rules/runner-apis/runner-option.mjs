import path from 'node:path';
import { readHeadPolicy, readLayout } from '../../../head-policy.mjs';
import { DEFAULT_TEST_RUNNER, TEST_RUNNERS } from '../../../test-runner/runners.mjs';
import { recordedTestRunner, runnerVocabulary } from '../../../test-runner/runner-vocabulary.mjs';
import {
  defaultTestFiles,
  testFileMatcher,
} from '../../../test-runner/test-files/test-file-patterns.mjs';

const layout = readLayout();

export const RUNNER_OPTION_PROPERTY = { runner: { enum: TEST_RUNNERS } };

export const RUNNER_OPTION_SCHEMA = [
  { type: 'object', properties: RUNNER_OPTION_PROPERTY, additionalProperties: false },
];

export function runnerOf(context) {
  return context.options[0]?.runner ?? recordedTestRunner(readHeadPolicy()) ?? DEFAULT_TEST_RUNNER;
}

export function vocabularyOf(context) {
  return runnerVocabulary(runnerOf(context));
}

export function projectRelative(filename, cwd) {
  const relative = path.relative(cwd, filename).split(path.sep).join('/');
  if (!relative.startsWith('..')) {
    return relative;
  }
  const roots = [...layout.sourceRoots, ...layout.testRoots];
  const root = roots.find((candidate) => filename.includes(`/${candidate}/`));
  return root === undefined ? relative : filename.slice(filename.indexOf(`/${root}/`) + 1);
}

function runnerTestFileMatcher(runner) {
  return runner === (recordedTestRunner(readHeadPolicy()) ?? DEFAULT_TEST_RUNNER)
    ? layout.isRunnerTestFile
    : testFileMatcher(defaultTestFiles(runner));
}

export function isCollectedByRunner(context) {
  return runnerTestFileMatcher(runnerOf(context))(projectRelative(context.filename, context.cwd));
}
