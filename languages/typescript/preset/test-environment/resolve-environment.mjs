import path from 'node:path';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { DEFAULT_TEST_RUNNER } from '../test-runner/runners.mjs';
import { projectTestRunner } from '../test-runner/project-runner.mjs';
import {
  loadedProjectMocha,
  mochaSetupEntries,
} from '../test-runner/test-files/mocha-test-files.mjs';
import { projectConfigFile } from './config-files.mjs';
import {
  DEFAULT_ENVIRONMENT,
  TEST_ENVIRONMENT_RULE,
  TEST_ENVIRONMENTS_VARIABLE,
} from './environments.mjs';
import { globalDomEnvironments, nodeSetupEntries } from './global-dom/global-dom.mjs';
import { environmentsFromJestConfig } from './jest/jest-environment.mjs';
import { jestConfigFile, readJestConfig } from './jest/read-jest-config.mjs';
import { readViteConfig } from './vite/vite-reader.mjs';

export { TEST_ENVIRONMENTS_VARIABLE };
export const LINT_CONFIG = 'languages/typescript/preset/defaults/eslint.config.mjs';

const TIMEOUT_MS = 30_000;
const UNKNOWN = { environment: undefined, scopes: [] };
const WHOLE_PROJECT_GLOBS = new Set(['**', '**/*']);
const NO_COMMAND = { environment: {}, nodeArguments: [], arguments_: [] };

function unreadable(projectRoot, configFile, failure) {
  const configPath = path.relative(projectRoot, configFile).split(path.sep).join('/');
  return {
    ...UNKNOWN,
    notice: { path: configPath, message: noticeFor(configPath, failure) },
  };
}

function loadJestEnvironments(options) {
  const { projectRoot, command } = options;
  const { config, failure } = readJestConfig(options);
  return config === undefined
    ? unreadable(
        projectRoot,
        path.resolve(projectRoot, jestConfigFile(projectRoot, command)),
        failure,
      )
    : environmentsFromJestConfig(config, projectRoot);
}

function loadMochaEnvironments({ projectRoot, liveProjectRoot, command }) {
  const loaded = loadedProjectMocha({ projectRoot, liveProjectRoot, tokens: command.arguments_ });
  return globalDomEnvironments(projectRoot, mochaSetupEntries(loaded));
}

function loadNodeEnvironments({ projectRoot, command }) {
  return globalDomEnvironments(projectRoot, nodeSetupEntries(command));
}

function loadViteEnvironments({ projectRoot, liveProjectRoot, timeoutMs }) {
  const configFile = projectConfigFile(projectRoot);
  if (configFile === undefined) {
    return { ...UNKNOWN, environment: DEFAULT_ENVIRONMENT };
  }
  const outcome = readViteConfig({
    configFile,
    projectRoot,
    resolveRoots: [...new Set([projectRoot, liveProjectRoot])],
    timeoutMs,
  });
  return outcome.result === undefined
    ? unreadable(projectRoot, configFile, outcome.failure)
    : outcome.result.environments;
}

const LOADERS = {
  jest: loadJestEnvironments,
  vitest: loadViteEnvironments,
  mocha: loadMochaEnvironments,
  node: loadNodeEnvironments,
};

export function loadTestEnvironments({
  projectRoot,
  liveProjectRoot = projectRoot,
  timeoutMs = TIMEOUT_MS,
  runner = DEFAULT_TEST_RUNNER,
  command = NO_COMMAND,
}) {
  const load = LOADERS[runner] ?? LOADERS[DEFAULT_TEST_RUNNER];
  return load({ projectRoot, liveProjectRoot, timeoutMs, command });
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
  if (!selected) {
    return UNKNOWN;
  }
  const { runner, command } = projectTestRunner(options);
  return loadTestEnvironments({ ...options, runner, command });
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
