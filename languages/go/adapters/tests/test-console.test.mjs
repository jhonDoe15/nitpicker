import { describe, expect, it } from 'vitest';
import { consoleMessages, goConsoleFacts } from './test-console.mjs';
import { parseTestEvents } from './test-events.mjs';

const CART = 'example.com/shop/cart';

function output(test, text, packageName = CART) {
  return JSON.stringify({
    Action: 'output',
    Package: packageName,
    ...(test === undefined ? {} : { Test: test }),
    Output: `${text}\n`,
  });
}

const REPORT = {
  tests: [
    { file: 'cart/cart_test.go', name: 'TestTotal' },
    { file: 'cart/discount_test.go', name: 'TestDiscount' },
    { file: 'main_test.go', name: 'TestMain' },
  ],
};

describe('Go test console output', () => {
  it.each([
    ['a standard log line', '2026/11/10 10:00:00 cache miss for cart 12', 'cache miss for cart 12'],
    ['a standard log line with microseconds', '2026/11/10 10:00:00.123456 retrying', 'retrying'],
    [
      'a slog warning through the standard log',
      '2026/11/10 10:00:00 WARN slow query',
      'WARN slow query',
    ],
  ])('counts %s without its clock', (_name, line, message) => {
    expect(consoleMessages(line)).toEqual([message]);
  });

  it.each([
    ['a slog text warning', 'time=2026-11-10T10:00:00Z level=WARN msg="slow query"'],
    ['a JSON error', '{"time":"2026-11-10","level":"error","msg":"lost"}'],
    ['a logrus warning', 'time="2026-11-10" level=warning msg=lost'],
    ['a zap console error', '2026-11-10T10:00:00.000Z\tERROR\tcart/total.go:12\tlost'],
    ['a klog warning', 'W1110 10:00:00.000000   12345 total.go:12] lost'],
  ])('counts %s', (_name, line) => {
    expect(consoleMessages(line)).toEqual([line]);
  });

  it.each([
    ['a plain print', 'total is 12'],
    ['a slog info line through the standard log', '2026/11/10 10:00:00 INFO loaded cart'],
    ['a slog text info line', 'time=2026-11-10T10:00:00Z level=INFO msg="slow query"'],
    ['a JSON debug line', '{"level":"debug","msg":"error budget ok"}'],
    ['a t.Log line', '    cart_test.go:12: ERROR expected'],
    ['a framing line', '=== RUN   TestERROR'],
    ['a test result', '--- FAIL: TestTotal (0.00s)'],
    ['a package result', 'ok  \texample.com/shop/cart\t0.01s'],
    ['a race report header', 'WARNING: DATA RACE'],
    ['prose naming an error', 'expected error, got nil'],
    ['an info line that names an error', 'level=INFO msg="ERROR count 0"'],
    ['a standard log info line that names an error', '2026/11/10 10:00:00 INFO no ERROR'],
    ['a klog info line', 'I1110 10:00:00.000000   12345 total.go:12] ERROR count 0'],
  ])('leaves out %s', (_name, line) => {
    expect(consoleMessages(line)).toEqual([]);
  });

  it('gives each test its file, and output outside a known test its package folder', () => {
    const run = parseTestEvents(
      [
        output('TestTotal', '=== RUN   TestTotal'),
        output('TestTotal', '2026/11/10 10:00:00 cache miss'),
        output('TestTotal/empty', 'level=ERROR msg=empty'),
        output('TestDiscount', 'discount 5'),
        output(undefined, 'WARN pool not closed'),
        output('TestMain', '2026/11/10 10:00:00 started', 'example.com/shop'),
        output('TestOther', 'WARN elsewhere', 'other.org/lib'),
      ].join('\n'),
    );
    expect(goConsoleFacts(run, { report: REPORT, module: 'example.com/shop' })).toEqual([
      { file: 'cart/cart_test.go', test: 'TestTotal', messages: ['cache miss'] },
      { file: 'cart/cart_test.go', test: 'TestTotal/empty', messages: ['level=ERROR msg=empty'] },
      { file: 'cart', test: '', messages: ['WARN pool not closed'] },
      { file: 'main_test.go', test: 'TestMain', messages: ['started'] },
      { file: '', test: 'TestOther', messages: ['WARN elsewhere'] },
    ]);
  });
});
