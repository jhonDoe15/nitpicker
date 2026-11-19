import path from 'node:path';
import { fieldOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import {
  missingProjectConfig,
  precedenceLayers,
  readHeadPolicyFile,
} from '../../project-tools/typed/shared-views.mts';
import type { ToolPolicy, ToolSettings } from '../../project-tools/typed/tool-types.mts';
import type { RetryContext, RetryRead } from '../project-config-types.mts';
import { PROJECT_CONFIG_NAMES, projectConfigFile } from '../../test-environment/config-files.mts';
import { readConfigInChild } from '../../test-environment/read-environment.mts';
import { testRunnerFor } from '../../test-runner/detect-runner.mts';
import {
  MOCHA_RC_FILES,
  PACKAGE_JSON,
  mochaConfigFiles,
  mochaSources,
} from '../../test-runner/mocha-config-files.mts';
import { runnerDisplayName } from '../../test-runner/runners.mts';
import { runnerCommand } from '../../test-runner/script-command.mts';
import { mochaConfigRetries } from './mocha-config.mts';
import { checkedRetry, retryValues } from './test-retry.mts';

export const TESTS_TOOL = 'tests';

function vitestRetry(projectRoot: string, { liveRoot }: RetryContext): RetryRead {
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
  return {
    file: name,
    files: [name],
    ignored: listOf(fieldOf(loaded, 'projectRetries')),
    ...checkedRetry(fieldOf(loaded, 'retry'), `test.retry in ${name}`, 'count-or-object'),
  };
}

function mochaRetry(projectRoot: string, { liveRoot, tokens }: RetryContext): RetryRead {
  const sources = mochaConfigFiles(projectRoot, tokens);
  const [first] = sources;
  if (first === undefined) {
    throw new Error(
      missingProjectConfig(TESTS_TOOL, 'a .mocharc.* file or a "mocha" key in package.json'),
    );
  }
  const retries = mochaConfigRetries({ projectRoot, liveRoot, tokens });
  return {
    file: first.label,
    files: sources.map(({ file }) => file),
    ...checkedRetry(retries, "Mocha's retries", 'count'),
  };
}

const RUNNER_READERS = new Map<string, (projectRoot: string, context: RetryContext) => RetryRead>([
  ['vitest', vitestRetry],
  ['mocha', mochaRetry],
]);

function runnerAndTokens(
  projectRoot: string,
  configuredRunner: string | undefined,
): { runner: string; tokens: readonly string[] } {
  const { runner, command } = testRunnerFor(projectRoot, configuredRunner);
  return { runner, tokens: runnerCommand(command, runner)?.arguments_ ?? [] };
}

export function readRunnerRetry(
  projectRoot: string,
  {
    configuredRunner,
    liveRoot = projectRoot,
  }: { configuredRunner: string | undefined; liveRoot?: string },
): { runner: string } & RetryRead {
  const { runner, tokens } = runnerAndTokens(projectRoot, configuredRunner);
  const read = RUNNER_READERS.get(runner);
  if (read === undefined) {
    throw new Error(
      `"tools.${TESTS_TOOL}.precedence" lists "project", but ${runnerDisplayName(runner)} has no ` +
        'config option it changes: remove "project" from tools.tests.precedence',
    );
  }
  return { runner, ...read(projectRoot, { liveRoot, tokens }) };
}

export function readTestRunnerProjectConfig(
  projectRoot: string,
  policy: ToolPolicy,
): { runner: string; retry?: unknown } {
  const { runner, retry } = readRunnerRetry(projectRoot, {
    configuredRunner: policy.tools?.[TESTS_TOOL]?.runner,
  });
  return { runner, ...(retry === undefined ? {} : { retry }) };
}

export function appliedRunnerRetry({
  root,
  config,
  liveRoot,
}: {
  readonly root: string;
  readonly config: ToolPolicy;
  readonly liveRoot: string;
}): { values: Record<string, unknown>; file: string; files: string[] } {
  const { retry, file, files } = readRunnerRetry(root, {
    configuredRunner: config.tools?.[TESTS_TOOL]?.runner,
    liveRoot,
  });
  return { values: retryValues(retry), file, files };
}

export function testRunnerProjectFiles(projectRoot: string, config: ToolPolicy): string[] {
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

export function projectTestRetry(
  runner: string,
  settings: ToolSettings | undefined = readHeadPolicyFile().tools?.['tests'],
): unknown {
  const layers = precedenceLayers(settings?.precedence);
  if (settings === undefined || !layers.usesProject || layers.nitpickerFirst) {
    return undefined;
  }
  const failure = fieldOf(settings, 'projectConfigError');
  if (failure !== undefined) {
    throw new Error(textOf(failure));
  }
  const projectConfig = fieldOf(settings, 'projectConfig');
  return fieldOf(projectConfig, 'runner') === runner ? fieldOf(projectConfig, 'retry') : undefined;
}
