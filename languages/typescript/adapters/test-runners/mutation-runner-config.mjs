import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeTestSelection } from './node-test/node-test.mjs';

const RUNNER_PLUGINS = {
  vitest: '@stryker-mutator/vitest-runner',
  jest: '@stryker-mutator/jest-runner',
  mocha: '@stryker-mutator/mocha-runner',
  node: '@stryker-mutator/tap-runner',
};

const STRYKER_RUNNER_NAMES = { vitest: 'vitest', jest: 'jest', mocha: 'mocha', node: 'tap' };

const MOCHA_LIST_OPTIONS = new Map([
  ['--require', 'require'],
  ['-r', 'require'],
  ['--file', 'file'],
  ['--extension', 'extension'],
]);
const MOCHA_VALUE_OPTIONS = new Map([
  ['--config', 'config'],
  ['--ui', 'ui'],
  ['-u', 'ui'],
  ['--package', 'package'],
]);

function pluginPath(name) {
  return fileURLToPath(import.meta.resolve(name));
}

function relativeFiles(options, files) {
  return files.map((file) =>
    path.isAbsolute(file) ? path.relative(options.projectRoot, file).replaceAll('\\', '/') : file,
  );
}

function optionValue(arguments_, index) {
  const token = arguments_[index];
  return token.includes('=') ? token.slice(token.indexOf('=') + 1) : arguments_[index + 1];
}

function mochaOptions(command, testFiles) {
  const result = { spec: [] };
  const consumed = new Set();
  for (const [index, token] of command.arguments_.entries()) {
    if (consumed.has(index)) continue;
    const name = token.split('=')[0];
    const key = MOCHA_LIST_OPTIONS.get(name) ?? MOCHA_VALUE_OPTIONS.get(name);
    if (key !== undefined) {
      const value = optionValue(command.arguments_, index);
      if (!token.includes('=')) consumed.add(index + 1);
      result[key] = MOCHA_LIST_OPTIONS.has(name) ? [...(result[key] ?? []), value] : value;
    } else if (!token.startsWith('-')) {
      result.spec.push(token);
    }
  }
  return { ...result, spec: [...result.spec, ...testFiles] };
}

function jestOptions(command) {
  const configIndex = command.arguments_.findIndex((token) =>
    ['--config', '-c'].includes(token.split('=')[0]),
  );
  return {
    projectType: 'custom',
    enableFindRelatedTests: false,
    ...(configIndex === -1 ? {} : { configFile: optionValue(command.arguments_, configIndex) }),
  };
}

function runnerOptions({ options, runner, command, testFiles }) {
  if (runner === 'jest') return { jest: jestOptions(command), disableTypeChecks: true };
  if (runner === 'mocha') {
    return { mochaOptions: mochaOptions(command, relativeFiles(options, testFiles)) };
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
  const plugins = [pluginPath(RUNNER_PLUGINS[runner]), pluginPath('@stryker-mutator/typescript-checker')];
  if (runner === 'vitest') return { ...withoutVitest, vitest, plugins };
  return {
    ...withoutVitest,
    plugins,
    testRunner: STRYKER_RUNNER_NAMES[runner],
    ...(runner === 'node' ? {} : { testRunnerNodeArgs: command.nodeArguments }),
    ...runnerOptions({ options, runner, command, testFiles }),
  };
}
