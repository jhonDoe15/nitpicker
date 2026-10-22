import { describe, expect, it } from 'vitest';
import { parseTestEvents } from './test-events.mjs';
import { testRunFindings } from './go-test.mjs';

const event = (fields) => JSON.stringify({ Time: '2026-10-22T20:10:48Z', ...fields });

const RUN = [
  event({ Action: 'start', Package: 'example.com/shop' }),
  event({ Action: 'run', Package: 'example.com/shop', Test: 'TestTotal' }),
  event({ Action: 'pass', Package: 'example.com/shop', Test: 'TestTotal', Elapsed: 0.2 }),
  event({ Action: 'run', Package: 'example.com/shop', Test: 'TestPrice' }),
  event({ Action: 'run', Package: 'example.com/shop', Test: 'TestPrice/zero' }),
  event({
    Action: 'output',
    Package: 'example.com/shop',
    Test: 'TestPrice/zero',
    Output: '=== RUN   TestPrice/zero\n',
  }),
  event({
    Action: 'output',
    Package: 'example.com/shop',
    Test: 'TestPrice/zero',
    Output: '    price_test.go:12: got 1, want 0\n',
  }),
  event({ Action: 'fail', Package: 'example.com/shop', Test: 'TestPrice/zero', Elapsed: 0 }),
  event({ Action: 'fail', Package: 'example.com/shop', Test: 'TestPrice', Elapsed: 0 }),
  event({ Action: 'skip', Package: 'example.com/shop', Test: 'TestLater', Elapsed: 0 }),
  event({ Action: 'fail', Package: 'example.com/shop', Elapsed: 0.3 }),
  'go: downloading example.com/dep v1.0.0',
  event({
    ImportPath: 'example.com/shop/broken',
    Action: 'build-output',
    Output: 'broken.go:3:1: syntax error\n',
  }),
  event({ ImportPath: 'example.com/shop/broken', Action: 'build-fail' }),
  event({
    Action: 'fail',
    Package: 'example.com/shop/broken',
    Elapsed: 0,
    FailedBuild: 'example.com/shop/broken',
  }),
  event({ Action: 'output', Package: 'example.com/shop/boot', Output: 'panic: missing config\n' }),
  event({ Action: 'fail', Package: 'example.com/shop/boot', Elapsed: 0.1 }),
].join('\n');

describe('parseTestEvents', () => {
  const parsed = parseTestEvents(RUN);

  it('lists every finished test with its time and outcome', () => {
    expect(parsed.tests).toEqual([
      { package: 'example.com/shop', name: 'TestTotal', seconds: 0.2, outcome: 'passed' },
      { package: 'example.com/shop', name: 'TestPrice/zero', seconds: 0, outcome: 'failed' },
      { package: 'example.com/shop', name: 'TestPrice', seconds: 0, outcome: 'failed' },
      { package: 'example.com/shop', name: 'TestLater', seconds: 0, outcome: 'skipped' },
    ]);
    expect(parsed.testsRan).toBe(true);
  });

  it('keeps the deepest failing test and package failures no test explains, never build failures', () => {
    expect(parsed.failures.map(({ id }) => id)).toEqual([
      'example.com/shop.TestPrice/zero',
      'example.com/shop/boot',
    ]);
    expect(parsed.buildFailures).toEqual(['example.com/shop/broken']);
  });

  it('turns failures into one tool error that quotes what each test printed', () => {
    expect(testRunFindings(parsed, 'base')).toEqual([
      {
        tool: 'tests',
        rule: 'tests-failed',
        path: '.',
        identity: 'tests-failed',
        message: [
          'Tests fail in the base snapshot. Make each failing test pass:',
          '  example.com/shop.TestPrice/zero',
          '    price_test.go:12: got 1, want 0',
          '  example.com/shop/boot',
          '    panic: missing config',
          'The static analyzers ran as usual; coverage comes from the tests that ran.',
        ].join('\n'),
        classification: 'tool-error',
      },
    ]);
  });

  it('reports a module where no test ran, unless a build failure stopped them', () => {
    const none = parseTestEvents(
      event({ Action: 'pass', Package: 'example.com/shop', Elapsed: 0 }),
    );
    expect(testRunFindings(none).map(({ rule }) => rule)).toEqual(['no-tests-ran']);
    expect(testRunFindings({ ...none, buildFailures: ['example.com/shop'] })).toEqual([]);
  });
});
