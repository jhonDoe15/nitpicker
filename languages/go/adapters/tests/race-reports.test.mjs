import { describe, expect, it } from 'vitest';
import {
  parseRaces,
  raceFindings,
  raceNotCheckedFinding,
  withoutRaceReports,
} from './race-reports.mjs';
import { raceUnavailable } from './go-test.mjs';

const MODULE = { root: '/work/shop', path: 'example.com/shop' };
const REPORT = [
  '=== RUN   TestCounter',
  '==================',
  'WARNING: DATA RACE',
  'Write at 0x00c000012318 by goroutine 8:',
  '  runtime.mapassign_faststr()',
  '      /usr/local/go/src/internal/runtime/maps/runtime_faststr.go:263 +0x0',
  '  example.com/shop/cart.(*Counter).Add()',
  '      /work/shop/cart/counter.go:5 +0x99',
  '  example.com/shop/cart.TestCounter.func1()',
  '      /work/shop/cart/counter_test.go:8 +0x12',
  '',
  'Previous read at 0x00c000012318 by goroutine 7:',
  '  example.com/shop/cart.(*Counter).Value()',
  '      /work/shop/cart/counter.go:7 +0x150',
  '  testing.tRunner()',
  '      /usr/local/go/src/testing/testing.go:1792 +0x225',
  '',
  'Goroutine 8 (running) created at:',
  '  example.com/shop/cart.TestCounter()',
  '      /work/shop/cart/counter_test.go:8 +0xf2',
  '==================',
  '    testing.go:1490: race detected during execution of test',
  '--- FAIL: TestCounter (0.00s)',
  '',
].join('\n');

describe('race reports', () => {
  it('names the first frame inside the module of both conflicting accesses', () => {
    expect(parseRaces(REPORT, MODULE)).toEqual([
      [
        {
          kind: 'write',
          function: 'cart.(*Counter).Add',
          full: 'example.com/shop/cart.(*Counter).Add',
          file: 'cart/counter.go',
          line: 5,
        },
        {
          kind: 'read',
          function: 'cart.(*Counter).Value',
          full: 'example.com/shop/cart.(*Counter).Value',
          file: 'cart/counter.go',
          line: 7,
        },
      ],
    ]);
  });

  it('reads module paths when the build trims file paths', () => {
    const trimmed = REPORT.replaceAll('/work/shop/', 'example.com/shop/');
    expect(parseRaces(trimmed, MODULE).map((race) => race.map(({ file }) => file))).toEqual([
      ['cart/counter.go', 'cart/counter.go'],
    ]);
  });

  it('keys a race by both functions, whichever access comes first, and reports it once', () => {
    const swapped = parseRaces(REPORT, MODULE)[0].toReversed();
    const findings = raceFindings([
      { accesses: parseRaces(REPORT, MODULE)[0], test: 'TestCounter' },
      { accesses: swapped, test: 'TestOther' },
    ]);
    expect(findings).toEqual([
      {
        tool: 'race',
        rule: 'data-race',
        path: 'cart/counter.go',
        identity: findings[0].identity,
        message:
          'Data race: write in cart.(*Counter).Add (cart/counter.go:5) and read in cart.(*Counter).Value (cart/counter.go:7) touch the same memory from two goroutines without synchronization, found by TestCounter. Guard the shared value with a sync.Mutex, make it a sync/atomic value, or hand it over through a channel.',
        allowedForm:
          'Guard the shared value with a sync.Mutex, make it a sync/atomic value, or hand it over through a channel.',
        classification: 'enforceable',
        location: { line: 5 },
      },
    ]);
    expect(raceFindings([{ accesses: swapped, test: '' }])[0].identity).toBe(findings[0].identity);
  });

  it('skips a report without two accesses in the module', () => {
    const outside = REPORT.replaceAll('/work/shop/cart/counter.go', '/elsewhere/counter.go');
    expect(parseRaces(outside, MODULE)).toEqual([]);
  });

  it('leaves the test output without the race report and the failure it caused', () => {
    expect(withoutRaceReports(REPORT)).toBe(
      '=== RUN   TestCounter\n--- FAIL: TestCounter (0.00s)\n',
    );
  });

  it('says why races were not checked when the toolchain cannot run the race detector', () => {
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
        { stdout: '{"Action":"pass","Package":"example.com/shop"}\n' },
      ].map(raceUnavailable),
    ).toEqual([
      'go test -race needs cgo, which is off (CGO_ENABLED=0, or Go found no C compiler).',
      'the race detector does not support linux/386.',
      'the race detector runtime did not build: cgo: C compiler "gcc" not found.',
      undefined,
    ]);
    expect(raceNotCheckedFinding('the race detector does not support linux/386.')).toEqual({
      tool: 'race',
      rule: 'race-not-checked',
      path: '.',
      identity: 'race-not-checked',
      message:
        'Data races were not checked: the race detector does not support linux/386. Enable cgo (CGO_ENABLED=1 with a C compiler such as gcc on the PATH) on a platform the race detector supports to run the tests with -race.',
      classification: 'descriptive',
    });
  });
});
