import path from 'node:path';
import { readHeadPolicyFile } from '../../../../../shared/head-policy.mjs';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../../shared/conventions/tool-precedence.mjs';
import { PROJECT_CONFIG_NAMES, projectConfigFile } from '../../test-environment/config-files.mjs';
import { readConfigInChild } from '../../test-environment/read-environment.mjs';
import { testRunnerFor } from '../../test-runner/detect-runner.mjs';
import {
  MOCHA_RC_FILES,
  PACKAGE_JSON,
  mochaConfigFiles,
  mochaSources,
} from '../../test-runner/mocha-config-files.mjs';
import { RUNNER_NAMES } from '../../test-runner/runners.mjs';
import { runnerCommand } from '../../test-runner/script-command.mjs';
import { mochaConfigRetries } from './mocha-config.mjs';
import { checkedRetry, retryValues } from './test-retry.mjs';

export const TESTS_TOOL = 'tests';

function vitestRetry(projectRoot, { liveRoot }) {
  const configFile = projectConfigFile(projectRoot);
  if (configFile === undefined) {
    throw new Error(missingProjectConfig(TESTS_TOOL, 'a vitest.config.* or vite.config.*'));
  }
  const name = path.basename(configFile);
  const loaded = readConfigInChild({
    configFile,
    projectRoot,
    resolveRoots: [...new Set([projectRoot, liveRoot])],
  });
  if (loaded.result === undefined) {
    throw new Error(`${name} could not be loaded: ${loaded.failure}`);
  }
  return {
    file: name,
    files: [name],
    ignored: loaded.result.projectRetries ?? [],
    ...checkedRetry(loaded.result.retry, `test.retry in ${name}`, true),
  };
}

function mochaRetry(projectRoot, { liveRoot, tokens }) {
  const sources = mochaConfigFiles(projectRoot, tokens);
  if (sources.length === 0) {
    throw new Error(
      missingProjectConfig(TESTS_TOOL, 'a .mocharc.* file or a "mocha" key in package.json'),
    );
  }
  const retries = mochaConfigRetries({ projectRoot, liveRoot, tokens });
  return {
    file: sources[0].label,
    files: sources.map(({ file }) => file),
    ...checkedRetry(retries, "Mocha's retries", false),
  };
}

const RUNNER_READERS = new Map([
  ['vitest', vitestRetry],
  ['mocha', mochaRetry],
]);

function runnerAndTokens(projectRoot, configuredRunner) {
  const { runner, command } = testRunnerFor(projectRoot, configuredRunner);
  return { runner, tokens: runnerCommand(command, runner)?.arguments_ ?? [] };
}

export function readRunnerRetry(projectRoot, { configuredRunner, liveRoot = projectRoot }) {
  const { runner, tokens } = runnerAndTokens(projectRoot, configuredRunner);
  const read = RUNNER_READERS.get(runner);
  if (read === undefined) {
    throw new Error(
      `"tools.${TESTS_TOOL}.precedence" lists "project", but ${RUNNER_NAMES[runner]} has no ` +
        'config option it changes: remove "project" from tools.tests.precedence',
    );
  }
  return { runner, ...read(projectRoot, { liveRoot, tokens }) };
}

export function readTestRunnerProjectConfig(projectRoot, policy) {
  const { runner, retry } = readRunnerRetry(projectRoot, {
    configuredRunner: policy.tools?.tests?.runner,
  });
  return { runner, ...(retry === undefined ? {} : { retry }) };
}

export function appliedRunnerRetry({ root, config, liveRoot }) {
  const { retry, file, files } = readRunnerRetry(root, {
    configuredRunner: config.tools?.[TESTS_TOOL]?.runner,
    liveRoot,
  });
  return { values: retryValues(retry), file, files };
}

export function testRunnerProjectFiles(projectRoot, config) {
  const { tokens } = runnerAndTokens(projectRoot, config.tools?.[TESTS_TOOL]?.runner);
  const { config: rc, package: manifest } = mochaSources(projectRoot, tokens);
  return [
    ...new Set(
      [...PROJECT_CONFIG_NAMES, ...MOCHA_RC_FILES, PACKAGE_JSON, rc, manifest].filter(
        (file) => file !== undefined,
      ),
    ),
  ];
}

export function projectTestRetry(runner, settings = readHeadPolicyFile().tools?.tests) {
  const layers = precedenceLayers(settings?.precedence);
  if (!layers.usesProject || layers.nitpickerFirst) {
    return undefined;
  }
  if (settings.projectConfigError !== undefined) {
    throw new Error(settings.projectConfigError);
  }
  return settings.projectConfig?.runner === runner ? settings.projectConfig.retry : undefined;
}
