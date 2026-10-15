export const TEST_RUNNERS = ['vitest', 'jest', 'node-test'];

export const DEFAULT_TEST_RUNNER = 'vitest';

const LABELS = new Map([
  ['vitest', 'Vitest'],
  ['jest', 'Jest'],
  ['node-test', 'node:test'],
]);

export function testRunnerLabel(runner) {
  return LABELS.get(runner) ?? runner;
}

export function configuredTestRunner(policy) {
  return policy?.tools?.tests?.runner;
}

export const RUNNER_CHOICE_HINT =
  'Choose one with "tools": { "tests": { "runner": "vitest" | "jest" | "node-test" } } in nitpicker.config.json.';
