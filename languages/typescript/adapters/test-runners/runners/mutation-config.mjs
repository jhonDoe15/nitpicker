import { fileURLToPath } from 'node:url';
import { readManifest, testScripts } from '../../../preset/test-runner/evidence.mjs';
import { jestEnvironment } from './jest.mjs';
import { nodeTestArgumentsOf } from './node-arguments.mjs';

const VITEST_RUNNER_PLUGIN = /[\\/]@stryker-mutator[\\/]vitest-runner[\\/]/u;

function withoutVitest({ vitest: _vitest, plugins, ...config }) {
  return { ...config, plugins: plugins.filter((plugin) => !VITEST_RUNNER_PLUGIN.test(plugin)) };
}

function runnerPlugin(name) {
  return fileURLToPath(import.meta.resolve(name));
}

function jestConfig(config) {
  return {
    ...config,
    plugins: [...config.plugins, runnerPlugin('@stryker-mutator/jest-runner')],
    testRunner: 'jest',
    jest: { projectType: 'custom' },
  };
}

function nodeTestConfig(config, { projectRoot, layout }) {
  const testFiles = layout.projectCodeFiles(projectRoot).filter(layout.isRunnableTestFile);
  const nodeArguments = nodeTestArgumentsOf(testScripts(readManifest(projectRoot)));
  return {
    ...config,
    plugins: [...config.plugins, runnerPlugin('@stryker-mutator/tap-runner')],
    testRunner: 'tap',
    tap: { testFiles, nodeArgs: [...nodeArguments, '--test-reporter=tap'] },
  };
}

const CONFIGURERS = new Map([
  ['jest', jestConfig],
  ['node-test', nodeTestConfig],
]);

export function mutationConfigFor(runner, { sourceConfig, tsconfigFile, projectRoot, layout }) {
  const base = { ...withoutVitest(sourceConfig), tsconfigFile };
  return CONFIGURERS.get(runner)(base, { projectRoot, layout });
}

export function mutationEnvironmentFor(runner, projectRoot) {
  return runner === 'jest' ? jestEnvironment(projectRoot) : {};
}
