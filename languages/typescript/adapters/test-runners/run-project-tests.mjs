import { projectTestRunner } from '../../preset/test-runner/project-runner.mjs';
import { runJest } from './jest/jest.mjs';
import { runMocha } from './mocha/mocha.mjs';
import { runNodeTest } from './node-test/node-test.mjs';
import { runVitest } from './vitest/vitest.mjs';

const ADAPTERS = {
  vitest: runVitest,
  jest: runJest,
  node: runNodeTest,
  mocha: runMocha,
};

export async function runProjectTests(options) {
  const { runner, command } = projectTestRunner(options.projectRoot);
  return { runner, ...(await ADAPTERS[runner](options, command)) };
}
