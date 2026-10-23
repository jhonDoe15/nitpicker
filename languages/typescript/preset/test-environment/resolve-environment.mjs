import { spawnSyncWithOutputFile } from '../../../../core/tooling/output-file.mjs';
import path from 'node:path';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { projectConfigFile } from './config-files.mjs';
import { DEFAULT_ENVIRONMENT } from './environments.mjs';
import { RESULT_MARKER } from './read-environment.mjs';

export const TEST_ENVIRONMENTS_VARIABLE = 'NITPICKER_TEST_ENVIRONMENTS';
export const TEST_ENVIRONMENT_RULE = 'nitpicker/no-unused-dom-environment';
export const LINT_CONFIG = 'languages/typescript/preset/defaults/eslint.config.mjs';

const READER = path.join(import.meta.dirname, 'read-environment.mjs');
const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const UNKNOWN = { environment: undefined, scopes: [] };
const WHOLE_PROJECT_GLOBS = new Set(['**', '**/*']);

function runReader({ configFile, projectRoot, resolveRoots, timeoutMs }) {
  const result = spawnSyncWithOutputFile(
    process.execPath,
    [READER, configFile, projectRoot, ...resolveRoots],
    {
      cwd: projectRoot,
      env: { ...process.env, VITEST: 'true', NODE_ENV: 'test' },
      encoding: 'utf8',
      input: '',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    },
  );
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

export function loadTestEnvironments({
  projectRoot,
  liveProjectRoot = projectRoot,
  timeoutMs = TIMEOUT_MS,
}) {
  const configFile = projectConfigFile(projectRoot);
  if (configFile === undefined) return { ...UNKNOWN, environment: DEFAULT_ENVIRONMENT };
  const outcome = runReader({
    configFile,
    projectRoot,
    resolveRoots: [...new Set([projectRoot, liveProjectRoot])],
    timeoutMs,
  });
  if (outcome.result === undefined) {
    const configPath = path.relative(projectRoot, configFile).split(path.sep).join('/');
    return {
      ...UNKNOWN,
      notice: { path: configPath, message: noticeFor(configPath, outcome.failure) },
    };
  }
  return outcome.result;
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
  const selected =
    options.configRelativePath === LINT_CONFIG &&
    !ruleIsExcepted(readHeadPolicy().exceptions) &&
    layout.projectCodeFiles(options.projectRoot).some((file) => layout.isRunnableTestFile(file));
  return selected ? loadTestEnvironments(options) : UNKNOWN;
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
