import { existsSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories } from '../../../../../../shared/filesystem.mjs';
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

function packageRoot(directory) {
  return ancestorDirectories(directory).find((candidate) =>
    existsSync(path.join(candidate, 'package.json')),
  );
}

function posixRelative(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

export function projectRelative(filename, cwd) {
  const relative = posixRelative(cwd, filename);
  if (!relative.startsWith('..')) {
    return relative;
  }
  const project = packageRoot(path.dirname(filename));
  if (project !== undefined) {
    return posixRelative(project, filename);
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
