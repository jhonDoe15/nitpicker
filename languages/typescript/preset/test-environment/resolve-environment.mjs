import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { DEFAULT_TEST_RUNNER } from '../test-runner/runners.mjs';
import { policyTestRunner } from '../test-runner/project-runner.mjs';
import { projectConfigFile } from './config-files.mjs';
import {
  DEFAULT_ENVIRONMENT,
  TEST_ENVIRONMENT_RULE,
  TEST_ENVIRONMENTS_VARIABLE,
} from './environments.mjs';
import { environmentsFromJestConfig } from './jest/jest-environment.mjs';
import { jestConfigFile, readJestConfig } from './jest/read-jest-config.mjs';
import { RESULT_MARKER } from './read-environment.mjs';

export { TEST_ENVIRONMENTS_VARIABLE, TEST_ENVIRONMENT_RULE };
export const LINT_CONFIG = 'languages/typescript/preset/defaults/eslint.config.mjs';

const READER = path.join(import.meta.dirname, 'read-environment.mjs');
const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const UNKNOWN = { environment: undefined, scopes: [] };
const WHOLE_PROJECT_GLOBS = new Set(['**', '**/*']);

function runReader({ configFile, projectRoot, resolveRoots, timeoutMs }) {
  const result = spawnSync(process.execPath, [READER, configFile, projectRoot, ...resolveRoots], {
    cwd: projectRoot,
    env: { ...process.env, VITEST: 'true', NODE_ENV: 'test' },
    encoding: 'utf8',
    input: '',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  });
  if (result.error?.code === 'ETIMEDOUT')
    return { failure: `it did not finish within ${String(timeoutMs)} ms` };
  if (result.error !== undefined) return { failure: result.error.message };
  const line = result.stdout
    .split('\n')
    .findLast((candidate) => candidate.startsWith(RESULT_MARKER));
  if (line === undefined)
    return { failure: `the config ended the process with exit code ${String(result.status)}` };
  return JSON.parse(line.slice(RESULT_MARKER.length));
}

function unreadable(projectRoot, configFile, failure) {
  const configPath = path.relative(projectRoot, configFile).split(path.sep).join('/');
  return {
    ...UNKNOWN,
    notice: { path: configPath, message: noticeFor(configPath, failure) },
  };
}

function loadJestEnvironments({ projectRoot, liveProjectRoot, timeoutMs }) {
  const { config, failure } = readJestConfig({ projectRoot, liveProjectRoot, timeoutMs });
  return config === undefined
    ? unreadable(projectRoot, path.join(projectRoot, jestConfigFile(projectRoot)), failure)
    : environmentsFromJestConfig(config, projectRoot);
}

function loadViteEnvironments({ projectRoot, liveProjectRoot, timeoutMs }) {
  const configFile = projectConfigFile(projectRoot);
  if (configFile === undefined) return { ...UNKNOWN, environment: DEFAULT_ENVIRONMENT };
  const outcome = runReader({
    configFile,
    projectRoot,
    resolveRoots: [...new Set([projectRoot, liveProjectRoot])],
    timeoutMs,
  });
  return outcome.result === undefined
    ? unreadable(projectRoot, configFile, outcome.failure)
    : outcome.result;
}

export function loadTestEnvironments({
  projectRoot,
  liveProjectRoot = projectRoot,
  timeoutMs = TIMEOUT_MS,
  runner = DEFAULT_TEST_RUNNER,
}) {
  const options = { projectRoot, liveProjectRoot, timeoutMs };
  if (runner === 'jest') return loadJestEnvironments(options);
  return runner === 'vitest'
    ? loadViteEnvironments(options)
    : { ...UNKNOWN, environment: DEFAULT_ENVIRONMENT };
}

function noticeFor(configPath, reason) {
  return `The project's test config ${configPath} could not be read (${reason}), so the DOM-environment check only uses per-file directives.`;
}

function ruleIsExcepted(exceptions) {
  return exceptions.some(
    ({ rule, paths }) =>
      rule === TEST_ENVIRONMENT_RULE && paths.some((glob) => WHOLE_PROJECT_GLOBS.has(glob)),
  );
}

export function testEnvironmentsFor(options) {
  const layout = readLayout();
  const policy = readHeadPolicy();
  const selected =
    options.configRelativePath === LINT_CONFIG &&
    !ruleIsExcepted(policy.exceptions) &&
    layout.projectCodeFiles(options.projectRoot).some((file) => layout.isRunnableTestFile(file));
  return selected
    ? loadTestEnvironments({
        ...options,
        runner: policyTestRunner(policy, options.projectRoot),
      })
    : UNKNOWN;
}

export function testEnvironmentNotices({ testEnvironments, analyzerName }) {
  const notice = testEnvironments.notice;
  if (notice === undefined) return [];
  return [
    {
      tool: analyzerName,
      rule: TEST_ENVIRONMENT_RULE,
      path: notice.path,
      identity: 'test-config-unreadable',
      message: notice.message,
      classification: 'descriptive',
    },
  ];
}
