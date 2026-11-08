import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { messageOf } from '../../analysis/test-runtime/test-support/runtime-data.mjs';
import { acceptedDigest } from '../../../../../core/command/test-support/accepted-digest.mjs';
import {
  NOISY_TEST,
  RUNTIME_TEST,
  TYPE_ONLY_TEST,
  UNLINKED_TEST,
} from '../test-support/python-preset-data.mjs';
import {
  commitBranch,
  fixtureRepository,
  gate,
  policyChangesOf,
  pythonE2eEnabled,
  removeRepositories,
} from '../test-support/python-e2e-support.mjs';
import { GATE_PACKAGES, enforceable } from '../test-support/python-gate-support.mjs';

const TEST_RUN_CONFIG = {
  preset: 'python',
  disable: ['mutation'],
  thresholds: { unitTestSeconds: 0.2 },
};

const LIFTED_CONFIG = JSON.stringify({
  ...TEST_RUN_CONFIG,
  testConsole: { allow: [{ contains: 'cache is cold', reason: 'fixture' }] },
  exceptions: [
    { rule: 'test-console-output', paths: ['tests/test_noisy.py'], reason: 'f' },
    { rule: 'slow-test', paths: ['tests/**'], reason: 'fixture' },
  ],
  python: { exceptions: [{ rule: 'sleep-in-test', paths: ['tests/**'], reason: 'fixture' }] },
});

const LIFTED_LOOSENINGS = [
  'analyzer disabled: mutation',
  'exception added: sleep-in-test for tests/** (fixture)',
  'exception added: slow-test for tests/** (fixture)',
  'exceptions for slow-test hide code this change adds or moves where the base config checked it: tests/test_noisy.py, tests/test_runtime.py',
  'exceptions for test-console-output hide code this change adds or moves where the base config checked it: tests/test_noisy.py',
  'python.exceptions for sleep-in-test hide code this change adds or moves where the base config checked it: tests/test_noisy.py, tests/test_runtime.py',
];

describe.skipIf(!pythonE2eEnabled)('Python preset test-run gates end to end', () => {
  let project;
  beforeAll(() => {
    project = fixtureRepository(GATE_PACKAGES);
    commitBranch(project, 'unlinked-tests', {
      'tests/test_unlinked.py': UNLINKED_TEST,
      'tests/test_typed_only.py': TYPE_ONLY_TEST,
    });
    const testRun = TEST_RUN_CONFIG;
    const testFiles = { 'tests/test_runtime.py': RUNTIME_TEST, 'tests/test_noisy.py': NOISY_TEST };
    commitBranch(project, 'test-run', {
      ...testFiles,
      'nitpicker.config.json': JSON.stringify(testRun),
    });
    commitBranch(project, 'test-run-lifted', {
      ...testFiles,
      'nitpicker.config.json': LIFTED_CONFIG,
    });
  });
  afterAll(removeRepositories);
  it('fails tests that run no production code, or only import it for the type checker', () => {
    const result = gate(project, 'unlinked-tests');

    expect(result.exitCode, result.text).toBe(1);
    expect(
      result
        .json('new-findings.json')
        .filter(
          ({ tool, classification }) => tool === 'test-runtime' && classification === 'enforceable',
        )
        .map(({ rule, path: file, message }) => ({ rule, path: file, message }))
        .sort((left, right) => left.path.localeCompare(right.path)),
    ).toEqual([
      {
        rule: 'type-only-production-dependency',
        path: 'tests/test_typed_only.py',
        message: `${messageOf('type-only-production-dependency')}. If this is intended, add {"rule":"type-only-production-dependency","paths":["tests/test_typed_only.py"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.`,
      },
      {
        rule: 'no-production-runtime',
        path: 'tests/test_unlinked.py',
        message: `${messageOf('no-production-runtime')}. If this is intended, add {"rule":"no-production-runtime","paths":["tests/test_unlinked.py"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.`,
      },
    ]);
  });
  it('fails a new slow test and new test output', () => {
    const mutationOff = acceptedDigest(['analyzer disabled: mutation'], {
      'nitpicker.config.json': JSON.stringify(TEST_RUN_CONFIG),
    });
    const result = gate(project, 'test-run', {
      environment: { CI: 'true', NITPICKER_ACCEPT_POLICY_CHANGE: mutationOff },
    });

    expect(result.exitCode, result.text).toBe(1);
    expect(enforceable(result)).toEqual([
      'python-rules sleep-in-test test_runtime.py',
      'test-console test-console-output test_noisy.py',
      'test-console test-console-output test_runtime.py',
      'test-runtime slow-test test_runtime.py',
    ]);
    const messages = Object.fromEntries(
      result
        .json('new-findings.json')
        .filter(({ path: file }) => file === 'tests/test_runtime.py')
        .map(({ rule, message }) => [rule, message.replace(/took 0\.\d+ s/, 'took <s> s')]),
    );
    expect(messages['test-console-output']).toBe(
      'Tests print new console output: "WARNING demo: cache is cold for key <n>" (test "test_value_is_cached"). Fix the cause (for example a timer that outlives the test), or allow a third-party message in "testConsole.allow" of nitpicker.config.json. If this is intended, add {"rule":"test-console-output","paths":["tests/test_runtime.py"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
    expect(messages['slow-test']).toBe(
      'test_value_is_cached took <s> s; a unit test may take 0.2 s. Remove time.sleep and other waits (patch the clock) and fake network, database and disk access, or move it to an integration test (an integration or e2e folder, or an integration or e2e marker registered in the pytest config) if it is one. If this is intended, add {"rule":"slow-test","paths":["tests/test_runtime.py"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });
  it('passes a new slow test and new test output once they are lifted', () => {
    const { policyLoosenings, policyDigest } = policyChangesOf(project, 'test-run-lifted');
    expect(policyLoosenings.toSorted()).toEqual(LIFTED_LOOSENINGS);
    const lifted = gate(project, 'test-run-lifted', {
      environment: { CI: 'true', NITPICKER_ACCEPT_POLICY_CHANGE: policyDigest },
    });
    expect(lifted.exitCode, lifted.text).toBe(0);
    expect(enforceable(lifted)).toEqual([]);
  });
});
