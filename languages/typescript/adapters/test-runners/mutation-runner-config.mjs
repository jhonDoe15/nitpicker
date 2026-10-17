import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mochaMutationOptions,
  projectMocha,
} from '../../preset/test-runner/test-files/mocha-options.mjs';
import { RESTORE_SINON_PLUGIN } from './mocha/mocha.mjs';
import { nodeTestSelection } from './node-test/node-test.mjs';
import { TEST_TIMEOUT_MS } from './test-run.mjs';

const RUNNER_PLUGINS = {
  vitest: '@stryker-mutator/vitest-runner',
  jest: '@stryker-mutator/jest-runner',
  mocha: '@stryker-mutator/mocha-runner',
  node: '@stryker-mutator/tap-runner',
};

const STRYKER_RUNNER_NAMES = { vitest: 'vitest', jest: 'jest', mocha: 'mocha', node: 'tap' };

const JEST_CONFIG_OPTIONS = new Set(['--config', '-c']);

const JEST_TIMEOUT_FACTOR = 2;

export const CRACO_JEST_CONFIG = '.nitpicker-diff-stryker.craco.jest.config.cjs';

const MOCHA_MUTATION_MAX_MAJOR = 11;

const CRACO_JEST_CONFIG_LINES = [
  "'use strict';",
  "process.env.NODE_ENV = process.env.NODE_ENV || 'test';",
  "process.env.BABEL_ENV = process.env.BABEL_ENV || 'test';",
  "const craco = (name) => require('@craco/craco/dist/lib/' + name);",
  'module.exports = async () => {',
  '  const context = { env: process.env.NODE_ENV };',
  "  const cracoConfig = await craco('config').loadCracoConfigAsync(context);",
  "  context.paths = craco('cra').getCraPaths(cracoConfig);",
  "  const provider = craco('cra').loadJestConfigProvider(cracoConfig);",
  "  return craco('features/jest/merge-jest-config').mergeJestConfig(cracoConfig, provider, context);",
  '};',
  '',
];

function pluginPath(name) {
  return fileURLToPath(import.meta.resolve(name));
}

function relativeFiles(options, files) {
  return files.map((file) =>
    path.isAbsolute(file) ? path.relative(options.projectRoot, file).replaceAll('\\', '/') : file,
  );
}

function optionValue(tokens, index) {
  const token = tokens[index];
  return token.includes('=') ? token.slice(token.indexOf('=') + 1) : tokens[index + 1];
}

export function unsupportedMutationRunner(options, runner) {
  const major = runner === 'mocha' ? projectMocha(options.projectRoot)?.major : undefined;
  if (major === undefined || major <= MOCHA_MUTATION_MAX_MAJOR) {
    return undefined;
  }
  const supported = String(MOCHA_MUTATION_MAX_MAJOR);
  return (
    `mutation skipped: Stryker's Mocha runner (@stryker-mutator/mocha-runner 10) supports Mocha up to ${supported}, ` +
    `and this project uses Mocha ${String(major)}. Coverage and CRAP still run; ` +
    `use Mocha ${supported} to get mutation testing.`
  );
}

export function cracoJestConfigText() {
  return CRACO_JEST_CONFIG_LINES.join('\n');
}

const CREATE_REACT_APP_LAUNCHERS = new Set(['react-scripts', 'react-app-rewired', 'rescripts']);

function jestConfigSource(command) {
  if (CREATE_REACT_APP_LAUNCHERS.has(command.launcher)) {
    return { projectType: 'create-react-app' };
  }
  if (command.launcher === 'craco') {
    return { projectType: 'custom', configFile: CRACO_JEST_CONFIG };
  }
  const tokens = command.arguments_;
  const configIndex = tokens.findIndex((token) => JEST_CONFIG_OPTIONS.has(token.split('=')[0]));
  const value = configIndex === -1 ? undefined : optionValue(tokens, configIndex);
  if (value === undefined) {
    return { projectType: 'custom' };
  }
  return value.trimStart().startsWith('{')
    ? { projectType: 'custom', config: JSON.parse(value) }
    : { projectType: 'custom', configFile: value };
}

function jestOptions(command) {
  const { projectType, config, ...source } = jestConfigSource(command);
  return {
    projectType,
    enableFindRelatedTests: false,
    ...source,
    config: { ...config, restoreMocks: true },
  };
}

function mochaConfig(options, command, testFiles) {
  const { mochaOptions, nodeArguments } = mochaMutationOptions({
    projectRoot: options.projectRoot,
    tokens: command.arguments_,
    testFiles: relativeFiles(options, testFiles),
  });
  return {
    testRunnerNodeArgs: [...command.nodeArguments, ...nodeArguments],
    mochaOptions: {
      ...mochaOptions,
      require: [...(mochaOptions.require ?? []), RESTORE_SINON_PLUGIN],
    },
  };
}

function runnerOptions({ options, runner, command, testFiles }) {
  if (runner === 'jest') {
    return {
      testRunnerNodeArgs: command.nodeArguments,
      jest: jestOptions(command),
      disableTypeChecks: true,
      timeoutMS: TEST_TIMEOUT_MS,
      timeoutFactor: JEST_TIMEOUT_FACTOR,
    };
  }
  if (runner === 'mocha') {
    return mochaConfig(options, command, testFiles);
  }
  const selection = nodeTestSelection(options, command);
  return {
    tap: {
      testFiles: relativeFiles(options, selection.testFiles),
      nodeArgs: selection.nodeArguments,
      forceBail: true,
    },
  };
}

export function mutationRunnerConfig({ options, runner, command, testFiles, sourceConfig }) {
  const { vitest, ...withoutVitest } = sourceConfig;
  const plugins = [
    pluginPath(RUNNER_PLUGINS[runner]),
    pluginPath('@stryker-mutator/typescript-checker'),
  ];
  if (runner === 'vitest') {
    return { ...withoutVitest, vitest, plugins };
  }
  return {
    ...withoutVitest,
    plugins,
    testRunner: STRYKER_RUNNER_NAMES[runner],
    ...runnerOptions({ options, runner, command, testFiles }),
  };
}
