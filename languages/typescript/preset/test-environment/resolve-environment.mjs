import path from 'node:path';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { projectConfigFile } from './config-files.mjs';
import { DEFAULT_ENVIRONMENT } from './environments.mjs';
import { readConfigInChild } from './read-environment.mjs';

export const TEST_ENVIRONMENTS_VARIABLE = 'NITPICKER_TEST_ENVIRONMENTS';
export const TEST_ENVIRONMENT_RULE = 'nitpicker/no-unused-dom-environment';
export const LINT_CONFIG = 'languages/typescript/preset/defaults/eslint.config.mjs';

const UNKNOWN = { environment: undefined, scopes: [] };
const WHOLE_PROJECT_GLOBS = new Set(['**', '**/*']);

export function loadTestEnvironments({ projectRoot, liveProjectRoot = projectRoot, timeoutMs }) {
  const configFile = projectConfigFile(projectRoot);
  if (configFile === undefined) return { ...UNKNOWN, environment: DEFAULT_ENVIRONMENT };
  const outcome = readConfigInChild({
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
