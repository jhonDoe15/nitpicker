import path from 'node:path';
import { isCount } from '../../../../../shared/config.mjs';
import { readInside } from '../../../../../shared/conventions/read-inside.mjs';
import { readHeadPolicyFile } from '../../../../../shared/head-policy.mjs';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../../shared/conventions/tool-precedence.mjs';
import { PROJECT_CONFIG_NAMES, projectConfigFile } from '../../test-environment/config-files.mjs';
import { readConfigInChild } from '../../test-environment/read-environment.mjs';
import { testRunnerFor } from '../../test-runner/detect-runner.mjs';
import { MOCHA_RC_FILES, mochaConfigRetries } from '../../test-runner/mocha-options.mjs';
import { RUNNER_NAMES } from '../../test-runner/runners.mjs';

export const TESTS_TOOL = 'tests';
export const TEST_RUNNER_PROJECT_FILES = [...PROJECT_CONFIG_NAMES, ...MOCHA_RC_FILES];
const RETRY_KEYS = new Set(['count', 'delay', 'condition']);
const RETRY_SETTINGS = [
  { files: PROJECT_CONFIG_NAMES, setting: 'test.retry', pattern: /\bretry\s*:/u },
  { files: MOCHA_RC_FILES, setting: 'retries', pattern: /["']?\bretries["']?\s*:/u },
];

function readText(projectRoot, name) {
  return readInside(projectRoot, name, 'utf8') ?? '';
}

function existingFile(projectRoot, names) {
  return names.find((name) => readInside(projectRoot, name) !== undefined);
}

function isCondition(value) {
  return value === undefined || (typeof value?.source === 'string' && value.flags === '');
}

function isRetry(retry, takesObject) {
  if (typeof retry === 'number' || !takesObject) {
    return isCount(retry);
  }
  return (
    typeof retry === 'object' &&
    retry !== null &&
    Object.keys(retry).every((key) => RETRY_KEYS.has(key)) &&
    [retry.count, retry.delay].every((value) => value === undefined || isCount(value)) &&
    isCondition(retry.condition)
  );
}

function checkedRetry(retry, setting, takesObject) {
  if (retry !== undefined && !isRetry(retry, takesObject)) {
    throw new Error(
      `${setting} is ${Number.isNaN(retry) ? 'not a number' : JSON.stringify(retry)}: it must be a whole number of 0 or more` +
        (takesObject ? ' or { count, delay, condition } with a condition without flags' : ''),
    );
  }
  return retry === undefined ? {} : { retry };
}

function vitestConfig(projectRoot) {
  const file = projectConfigFile(projectRoot);
  if (file === undefined) {
    throw new Error(missingProjectConfig(TESTS_TOOL, 'a vitest.config.* or vite.config.*'));
  }
  const name = path.basename(file);
  const loaded = readConfigInChild({ configFile: file, projectRoot, resolveRoots: [projectRoot] });
  if (loaded.result === undefined) {
    throw new Error(`${name} could not be loaded: ${loaded.failure}`);
  }
  return checkedRetry(loaded.result.retry, `test.retry in ${name}`, true);
}

function manifestMocha(projectRoot) {
  const text = readText(projectRoot, 'package.json');
  if (text === '') {
    return {};
  }
  try {
    return { mocha: JSON.parse(text).mocha };
  } catch (error) {
    return { malformed: `package.json is not valid JSON: ${error.message}` };
  }
}

function mochaConfig(projectRoot) {
  const manifest = manifestMocha(projectRoot);
  if (manifest.malformed !== undefined) {
    throw new Error(manifest.malformed);
  }
  const hasRc = existingFile(projectRoot, MOCHA_RC_FILES) !== undefined;
  if (!hasRc && manifest.mocha === undefined) {
    throw new Error(
      missingProjectConfig(TESTS_TOOL, 'a .mocharc.* file or a "mocha" key in package.json'),
    );
  }
  return checkedRetry(mochaConfigRetries(projectRoot), "Mocha's retries", false);
}

const RUNNER_CONFIGS = new Map([
  ['vitest', vitestConfig],
  ['mocha', mochaConfig],
]);

export function readTestRunnerProjectConfig(projectRoot, policy) {
  const { runner } = testRunnerFor(projectRoot, policy.tools?.tests?.runner);
  const read = RUNNER_CONFIGS.get(runner);
  if (read === undefined) {
    throw new Error(
      `"tools.${TESTS_TOOL}.precedence" lists "project", but ${RUNNER_NAMES[runner]} has no ` +
        'config option it changes: remove "project" from tools.tests.precedence',
    );
  }
  return { runner, ...read(projectRoot) };
}

export function projectTestRetry(runner, settings = readHeadPolicyFile().tools?.tests) {
  const { usesProject, nitpickerFirst } = precedenceLayers(settings?.precedence);
  if (!usesProject) {
    return undefined;
  }
  if (settings.projectConfigError !== undefined) {
    throw new Error(settings.projectConfigError);
  }
  return nitpickerFirst || settings.projectConfig?.runner !== runner
    ? undefined
    : settings.projectConfig.retry;
}

export function vitestRetryArguments(retry = projectTestRetry('vitest')) {
  if (typeof retry !== 'object') {
    return retry === undefined ? [] : [`--retry=${String(retry)}`];
  }
  return [
    ...(retry.count === undefined ? [] : [`--retry.count=${String(retry.count)}`]),
    ...(retry.delay === undefined ? [] : [`--retry.delay=${String(retry.delay)}`]),
    ...(retry.condition === undefined ? [] : [`--retry.condition=${retry.condition.source}`]),
  ];
}

export function retryingConfigFiles(projectRoot) {
  const files = RETRY_SETTINGS.flatMap(({ files: names, setting, pattern }) => {
    const file = existingFile(projectRoot, names);
    return file !== undefined && pattern.test(readText(projectRoot, file))
      ? [{ setting, file }]
      : [];
  });
  const { mocha } = manifestMocha(projectRoot);
  return mocha?.retries === undefined
    ? files
    : [...files, { setting: 'retries', file: 'package.json "mocha"' }];
}
