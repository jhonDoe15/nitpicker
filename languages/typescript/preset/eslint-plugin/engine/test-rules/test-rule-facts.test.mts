import { describe, expect, it } from 'vitest';
import { TEST_ENGINE_RULES } from './test-rule-facts.mts';

const project = { root: '/project', environment: {} };

function conditionOf(rule: string, kind: string): (value: string, filename: string) => boolean {
  const found = TEST_ENGINE_RULES.find(([name]) => name === rule)?.[1].conditions?.[kind];
  if (found === undefined) {
    throw new Error(`${rule} has no ${kind} condition`);
  }
  return found;
}

function factsOf(rule: string, filename: string, options: readonly unknown[] = []) {
  const entry = TEST_ENGINE_RULES.find(([name]) => name === rule)?.[1];
  return entry?.facts?.(filename, options, project);
}

describe('facts of the test rules on the engine', () => {
  it('marks a file under a test root integration folder as an integration test', () => {
    expect(
      factsOf('integration-test-uses-approved-harness', 'C:\\project\\test\\integration\\a.test.ts'),
    ).toEqual({
      integration: 'true',
      'approved-functions': 'null',
      'approved-subprocesses': 'null',
    });
  });

  it('passes the approved harness names on', () => {
    const facts = factsOf('integration-test-uses-approved-harness', '/project/src/a.test.ts', [
      { approvedFunctions: ['boot'], approvedSubprocesses: [] },
    ]);
    expect(facts).toEqual({
      integration: 'false',
      'approved-functions': '["boot"]',
      'approved-subprocesses': '[]',
    });
  });

  it('gives the words of the chosen runner', () => {
    expect(
      factsOf('no-fixed-sleep-synchronization', '/project/test/a.test.ts', [{ runner: 'node' }]),
    ).toMatchObject({ 'advance-fake-time': 'mock.timers.tick', fixture: 'false' });
  });

  it('passes on whether tests run concurrently by default', () => {
    const file = '/project/test/a.test.ts';
    expect(factsOf('no-worker-state-in-concurrent-tests', file, [{ concurrent: true }])).toEqual({
      concurrent: 'true',
    });
    expect(factsOf('no-worker-state-in-concurrent-tests', file)).toEqual({ concurrent: 'false' });
  });

  it('passes on whether network calls are checked', () => {
    expect(
      factsOf('no-real-time-random-or-network', '/project/test/a.test.ts', [{ network: true }]),
    ).toMatchObject({ network: 'true' });
  });

  it('tells a file the runner collects from one it does not', () => {
    expect(factsOf('no-uncollected-tests', '/project/test/a.test.ts')).toMatchObject({
      collected: 'true',
    });
    expect(factsOf('no-uncollected-tests', '/project/test/helpers/a.ts')).toMatchObject({
      collected: 'false',
    });
  });

  it('keeps only production modules as mocked subjects and setup imports', () => {
    const subject = conditionOf('no-mocking-subject-under-test', 'production-subject');
    expect(subject('../src/orders', 'C:\\project\\test\\a.test.ts')).toBe(true);
    expect(subject('./helpers/build', '/project/test/a.test.ts')).toBe(false);
    const setup = conditionOf('no-production-imports-in-setup-files', 'production-module');
    expect(setup('../src/orders', '/project/test/setup.ts')).toBe(true);
    expect(setup('vitest', '/project/test/setup.ts')).toBe(false);
  });
});
