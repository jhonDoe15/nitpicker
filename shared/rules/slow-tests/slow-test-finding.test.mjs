import { describe, expect, it } from 'vitest';
import {
  shownSeconds,
  slowestRuns,
  slowTestBudget,
  slowTestFindings,
  slowTestLimits,
} from './slow-test-finding.mjs';

const TEST = {
  path: 'tests/test_pay.py',
  name: 'test_pay.TestPay test_slow',
  identity: 'test:tests.test_pay.TestPay#test_slow',
  seconds: 7.25,
  line: 12,
};

describe('slow test findings', () => {
  it('defaults the budgets to 5 and 30 seconds and lets the config override either', () => {
    expect(slowTestBudget(undefined)).toEqual({ unitTestSeconds: 5, integrationTestSeconds: 30 });
    expect(slowTestBudget({ unitTestSeconds: 2 })).toEqual({
      unitTestSeconds: 2,
      integrationTestSeconds: 30,
    });
  });

  it('keeps the slowest run of a test that ran more than once', () => {
    const runs = [
      { id: 'a', seconds: 1 },
      { id: 'a', seconds: 3 },
      { id: 'b', seconds: 2 },
      { id: 'a', seconds: 2 },
    ];
    expect(slowestRuns(runs, ({ id }) => id)).toEqual([
      { id: 'a', seconds: 3 },
      { id: 'b', seconds: 2 },
    ]);
  });

  it('builds the finding for a unit test with the move advice and the exception route', () => {
    expect(
      slowTestFindings({
        tool: 'test-runtime',
        language: 'python',
        advice: 'pytest',
        test: TEST,
        integration: false,
      }),
    ).toEqual([
      {
        tool: 'test-runtime',
        rule: 'slow-test',
        path: 'tests/test_pay.py',
        identity: 'test:tests.test_pay.TestPay#test_slow',
        location: { line: 12 },
        message:
          'test_pay.TestPay test_slow took 7.3 s; a unit test may take 5 s. Remove time.sleep and ' +
          'other waits (patch the clock) and fake network, database and disk access, or move it to ' +
          'an integration test (an integration or e2e folder under tests, or an integration marker ' +
          'registered in the pytest config) if it is one. If this is intended, add ' +
          '{"rule":"slow-test","paths":["tests/test_pay.py"],"reason":"..."} ' +
          'to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
      },
    ]);
  });

  it('gives an integration test its own budget and no move advice', () => {
    const withoutLine = { ...TEST, line: undefined };
    const limits = { integrationTestSeconds: 7 };
    expect(
      slowTestFindings({
        tool: 'coverage',
        language: 'typescript',
        test: withoutLine,
        integration: true,
        limits,
      }),
    ).toEqual([
      {
        tool: 'coverage',
        rule: 'slow-test',
        path: 'tests/test_pay.py',
        identity: 'test:tests.test_pay.TestPay#test_slow',
        message:
          'test_pay.TestPay test_slow took 7.3 s; an integration test may take 7 s. Remove fixed ' +
          'sleeps and real timers (use fake timers) and mock network, database and disk access. If ' +
          'this is intended, add {"rule":"slow-test","paths":["tests/test_pay.py"],"reason":"..."} ' +
          'to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
      },
    ]);
  });

  it('reports nothing for a test within its budget', () => {
    const test = { ...TEST, seconds: 5 };
    expect(
      slowTestFindings({ tool: 'test-runtime', language: 'python', test, integration: false }),
    ).toEqual([]);
  });

  it('reads only the slow test budgets of the thresholds', () => {
    expect(slowTestLimits({ crapLimit: 3, unitTestSeconds: 2 })).toEqual({ unitTestSeconds: 2 });
    expect(slowTestLimits({})).toEqual({});
  });

  it('shows two decimals when one would print the budget itself', () => {
    expect([shownSeconds(5.04, 5), shownSeconds(5.04, 6), shownSeconds(7.25, 5)]).toEqual([
      '5.04',
      '5.0',
      '7.3',
    ]);
  });
});
