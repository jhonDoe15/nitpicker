import { describe, expect, it } from 'vitest';
import {
  parseRaces,
  raceFindings,
  raceNotCheckedFinding,
  WARNING,
  withoutRaceReports,
} from './race-reports.mjs';

const MODULE = { root: '/work/my shop', path: 'example.com/shop' };
const REPORT = [
  '=== RUN   TestCounter',
  '==================',
  WARNING,
  'Write at 0x00c000012318 by goroutine 8:',
  '  runtime.mapassign_faststr()',
  '      /usr/local/go/src/internal/runtime/maps/runtime_faststr.go:263 +0x0',
  '  example.com/shop/cart.(*Counter).Add()',
  '      /work/my shop/cart/counter.go:5 +0x99',
  '  example.com/shop/cart.TestCounter.func1()',
  '      /work/my shop/cart/counter_test.go:8 +0x12',
  '',
  'Previous read at 0x00c000012318 by goroutine 7:',
  '  example.com/shop/cart.(*Counter).Value()',
  '      /work/my shop/cart/counter.go:7 +0x150',
  '  testing.tRunner()',
  '      /usr/local/go/src/testing/testing.go:1792 +0x225',
  '',
  'Goroutine 8 (running) created at:',
  '  example.com/shop/cart.TestCounter()',
  '      /work/my shop/cart/counter_test.go:8 +0xf2',
  '==================',
  '    testing.go:1490: race detected during execution of test',
  '--- FAIL: TestCounter (0.00s)',
  '',
].join('\n');
const ADD = {
  kind: 'write',
  function: 'cart.(*Counter).Add',
  full: 'example.com/shop/cart.(*Counter).Add',
  file: 'cart/counter.go',
  line: 5,
};
const VALUE = {
  kind: 'read',
  function: 'cart.(*Counter).Value',
  full: 'example.com/shop/cart.(*Counter).Value',
  file: 'cart/counter.go',
  line: 7,
};
const FIX =
  'Guard the shared value with a sync.Mutex, make it a sync/atomic value, or hand it over through a channel.';

describe('race reports', () => {
  it('names the first frame inside the module of both conflicting accesses', () => {
    expect(parseRaces(REPORT, MODULE)).toEqual([[ADD, VALUE]]);
  });

  it('reads module paths when the build trims file paths', () => {
    const trimmed = REPORT.replaceAll('/work/my shop/', 'example.com/shop/');
    expect(parseRaces(trimmed, MODULE)).toEqual([[ADD, VALUE]]);
  });

  it('keys a race by both functions, whichever access comes first, and reports it once', () => {
    const findings = raceFindings([
      { accesses: [ADD, VALUE], test: 'TestCounter' },
      { accesses: [VALUE, ADD], test: 'TestOther' },
    ]);
    expect(findings).toEqual([
      {
        tool: 'race',
        rule: 'data-race',
        path: 'cart/counter.go',
        identity: findings[0].identity,
        message: `Data race: write in cart.(*Counter).Add (cart/counter.go:5) and read in cart.(*Counter).Value (cart/counter.go:7) touch the same memory from two goroutines without synchronization, found by TestCounter. ${FIX}`,
        allowedForm: FIX,
        classification: 'enforceable',
        location: { line: 5 },
      },
    ]);
  });

  it('keeps a closure race stable when another closure is added before it', () => {
    const closure = (number) => ({ ...ADD, full: `example.com/shop/cart.Run.func${number}` });
    const [before] = raceFindings([{ accesses: [closure(1), VALUE], test: '' }]);
    const [after] = raceFindings([{ accesses: [closure(2), VALUE], test: '' }]);
    expect(after.identity).toBe(before.identity);
  });

  it('still reports a race whose other stack could not be restored or is outside the module', () => {
    const lost = REPORT.replace(
      /Previous read[^\n]*\n(?:[^\n]+\n)+/u,
      'Previous read at 0x00c000012318 by goroutine 7:\n  [failed to restore the stack]\n',
    );
    const [race] = parseRaces(lost, MODULE);
    expect(race).toEqual([
      ADD,
      { kind: 'read', function: 'a function the report does not name', full: '?' },
    ]);
    const outside = REPORT.replaceAll('/work/my shop/cart/', '/elsewhere/');
    expect(raceFindings([{ accesses: parseRaces(outside, MODULE)[0], test: '' }])[0].path).toBe(
      '.',
    );
  });

  it('removes only the race report and the failure it caused from a test output', () => {
    const banner = '==================\nexpected:\n==================\n';
    expect(withoutRaceReports(`${banner}${REPORT}`)).toBe(
      `${banner}=== RUN   TestCounter\n--- FAIL: TestCounter (0.00s)\n`,
    );
  });

  it('says why races were not checked', () => {
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
