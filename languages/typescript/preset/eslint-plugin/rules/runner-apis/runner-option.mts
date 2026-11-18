import { existsSync } from 'node:fs';
import path from 'node:path';
import type { JSONSchema } from '@typescript-eslint/utils';
import { ancestorDirectories as untypedAncestorDirectories } from '../../../../../../shared/filesystem.mjs';
import { posixRelative as untypedPosixRelative } from '../../../../../../shared/project-files/tree-walk.mjs';
import { readHeadPolicy, readLayout } from '../typed/policy-views.mts';
import { DEFAULT_TEST_RUNNER, TEST_RUNNERS } from '../../../test-runner/runners.mjs';
import { recordedTestRunner as untypedRecordedTestRunner } from '../../../test-runner/vocabulary/runner-vocabulary.mjs';
import {
  type RunnerVocabulary,
  runnerVocabulary,
} from '../../../test-runner/vocabulary/typed-vocabulary.mts';
import {
  defaultTestFiles as untypedDefaultTestFiles,
  testFileMatcher as untypedTestFileMatcher,
} from '../../../test-runner/test-files/test-file-patterns.mjs';
import { fieldOf } from '../../../../../../shared/values/readers.mts';

type RunnerContext = {
  readonly options: readonly unknown[];
  readonly filename: string;
  readonly cwd: string;
};
type FileMatcher = (file: string) => boolean;

const ancestorDirectories: (directory: string) => string[] = untypedAncestorDirectories;
const posixRelative: (from: string, to: string) => string = untypedPosixRelative;
const recordedTestRunner: (policy: unknown) => string | undefined = untypedRecordedTestRunner;
const defaultTestFiles: (runner: string) => unknown = untypedDefaultTestFiles;
const testFileMatcher: (patterns: unknown) => FileMatcher = untypedTestFileMatcher;
const defaultRunner: string = DEFAULT_TEST_RUNNER;

const layout = readLayout();

export const RUNNER_OPTION_PROPERTY: Readonly<Record<string, JSONSchema.JSONSchema4>> = {
  runner: { type: 'string', enum: TEST_RUNNERS },
};

export const RUNNER_OPTION_SCHEMA: JSONSchema.JSONSchema4[] = [
  { type: 'object', properties: { ...RUNNER_OPTION_PROPERTY }, additionalProperties: false },
];

function projectRunner(): string {
  return recordedTestRunner(readHeadPolicy()) ?? defaultRunner;
}

export function runnerOf(context: Pick<RunnerContext, 'options'>): string {
  const runner = fieldOf(context.options[0], 'runner');
  return typeof runner === 'string' ? runner : projectRunner();
}

export function vocabularyOf(context: Pick<RunnerContext, 'options'>): RunnerVocabulary {
  return runnerVocabulary(runnerOf(context));
}

function packageRoot(directory: string): string | undefined {
  return ancestorDirectories(directory).find((candidate) =>
    existsSync(path.join(candidate, 'package.json')),
  );
}

export function projectRelative(filename: string, cwd: string): string {
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

function runnerTestFileMatcher(runner: string): FileMatcher {
  return runner === projectRunner()
    ? layout.isRunnerTestFile
    : testFileMatcher(defaultTestFiles(runner));
}

export function isCollectedByRunner(context: RunnerContext): boolean {
  return runnerTestFileMatcher(runnerOf(context))(projectRelative(context.filename, context.cwd));
}
