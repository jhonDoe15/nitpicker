import { describe, expect, it } from 'vitest';
import { parseTestEvents } from '../tests/test-events.mjs';
import { raceOnlyFailures, raceUnavailable } from './race-run.mjs';

const event = (fields) => JSON.stringify({ Package: 'example.com/shop', ...fields });

function runWith(events, calls) {
  return {
    projectRoot: '/work/shop',
    environment: {},
    settings: {},
    spawn: (program, args) => {
      calls.push([program, ...args].join(' '));
      return { status: 0, stdout: events.join('\n'), stderr: '' };
    },
  };
}

const RACED_RUN = parseTestEvents(
  [
    event({ Action: 'run', Test: 'TestTally' }),
    event({ Action: 'output', Test: 'TestTally', Output: 'WARNING: DATA RACE\n' }),
    event({ Action: 'output', Test: 'TestTally', Output: '    tally_test.go:6: loaded\n' }),
    event({ Action: 'fail', Test: 'TestTally' }),
    event({ Action: 'run', Test: 'TestPeer' }),
    event({ Action: 'fail', Test: 'TestPeer' }),
    event({ Action: 'run', Test: 'TestBroken' }),
    event({ Action: 'output', Test: 'TestBroken', Output: '    tally_test.go:9: wrong\n' }),
    event({ Action: 'fail', Test: 'TestBroken' }),
    event({ Action: 'fail' }),
    event({ Package: 'example.com/shop/other', Action: 'run', Test: 'TestFlaky' }),
    event({ Package: 'example.com/shop/other', Action: 'fail', Test: 'TestFlaky' }),
    event({ Package: 'example.com/shop/other', Action: 'fail' }),
  ].join('\n'),
);

describe('race run', () => {
  it('reruns without -race only the failures of packages that raced, and keeps those that pass', () => {
    const calls = [];
    const context = runWith(
      [
        event({ Action: 'pass', Test: 'TestTally' }),
        event({ Action: 'pass', Test: 'TestPeer' }),
        event({ Action: 'fail', Test: 'TestBroken' }),
        event({ Action: 'fail' }),
      ],
      calls,
    );
    expect(raceOnlyFailures(context, RACED_RUN)).toEqual([
      { id: 'example.com/shop.TestTally', package: 'example.com/shop' },
      { id: 'example.com/shop.TestPeer', package: 'example.com/shop' },
    ]);
    expect(calls).toEqual([
      'go test -vet=off -json -count=1 -run ^(?:TestBroken|TestPeer|TestTally)$ example.com/shop',
    ]);
  });

  it('reruns a package that timed out under -race and counts it as passing when it passes', () => {
    const timedOut = parseTestEvents(
      [
        event({ Action: 'run', Test: 'TestSlow' }),
        event({
          Action: 'output',
          Test: 'TestSlow',
          Output: 'panic: test timed out after 10m0s\n',
        }),
        event({ Action: 'fail' }),
      ].join('\n'),
    );
    const calls = [];
    const context = runWith(
      [event({ Action: 'pass', Test: 'TestSlow' }), event({ Action: 'pass' })],
      calls,
    );
    expect(raceOnlyFailures(context, timedOut)).toEqual([
      { id: 'example.com/shop', package: 'example.com/shop' },
    ]);
    expect(calls).toEqual(['go test -vet=off -json -count=1 example.com/shop']);
  });

  it('runs nothing again when no failing package raced or timed out', () => {
    const calls = [];
    const plain = parseTestEvents(
      [
        event({ Action: 'run', Test: 'TestBroken' }),
        event({ Action: 'fail', Test: 'TestBroken' }),
      ].join('\n'),
    );
    expect(raceOnlyFailures(runWith([], calls), plain)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('says why the race detector could not run', () => {
    expect(
      [
        { stderr: 'go: -race requires cgo; enable cgo by setting CGO_ENABLED=1\n' },
        { stderr: '-race is not supported on linux/386\n' },
        {
          stdout: [
            '{"ImportPath":"runtime/cgo","Action":"build-output","Output":"# runtime/cgo\\n"}',
            '{"ImportPath":"runtime/cgo","Action":"build-output","Output":"cgo: C compiler \\"gcc\\" not found\\n"}',
            '{"ImportPath":"runtime/cgo","Action":"build-fail"}',
          ].join('\n'),
        },
        { stderr: 'FATAL: ThreadSanitizer: unexpected memory mapping 0x7f\n' },
        { error: Object.assign(new Error('spawnSync go ETIMEDOUT'), { code: 'ETIMEDOUT' }) },
        { stdout: '{"Action":"output","Test":"TestDocs","Output":"-race requires cgo\\n"}\n' },
      ].map(raceUnavailable),
    ).toEqual([
      'go test -race needs cgo, which is off (CGO_ENABLED=0, or Go found no C compiler).',
      'the race detector does not support linux/386.',
      'the race detector runtime did not build: cgo: C compiler "gcc" not found.',
      'the race detector cannot run on this machine: FATAL: ThreadSanitizer: unexpected memory mapping 0x7f.',
      'go test -race ran past the time limit, so the tests ran again without it.',
      undefined,
    ]);
  });
});
