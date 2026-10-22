import { describe, expect, it } from 'vitest';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { normalizeConsoleMessage, testConsoleFindings } from './console-findings.mjs';

const ORDER_TEST = 'src/test/java/shop/OrderTest.java';
const CART_TEST = 'src/test/java/shop/CartTest.java';

const ADVICE =
  'Fix the cause (for example a warning the code under test now logs, or a mock or thread that outlives the test), or allow a third-party message in "testConsole.allow" of nitpicker.config.json.';

function spring(thread) {
  return `2024-05-01T12:00:01.123Z  WARN 4242 --- [${thread}] shop.Orders : late`;
}

function hint(file) {
  return `If this is intended, add {"rule":"test-runtime/test-console-output","paths":["${file}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`;
}

function messagesOf(findings) {
  return findings.map(({ path: file, message }) => `${file} ${message.split(' (')[0]}`);
}

describe('normalizeConsoleMessage', () => {
  it('replaces times, paths, numbers and random-looking words', () => {
    expect(
      normalizeConsoleMessage(
        '2024-05-01 12:00:01.123 WARN  [pool-3] wrote /tmp/run-8/out.json in 42 ms, id a1b2c3d4e5 at 10:15:30',
      ),
    ).toBe('<time> WARN [pool-<n>] wrote out.json in <n>, id <id> at <time>');
  });

  it('drops the thread name of Spring Boot and Logback log lines, which differs between builds', () => {
    expect(normalizeConsoleMessage(spring('           main'))).toBe(
      normalizeConsoleMessage(spring('    Test worker')),
    );
    expect(normalizeConsoleMessage(spring('main'))).toBe(
      '<time> WARN <n> --- [<thread>] shop.Orders : late',
    );
    expect(normalizeConsoleMessage('12:00:01.123 [Test worker] ERROR shop.Orders - lost')).toBe(
      '<time> [<thread>] ERROR shop.Orders - lost',
    );
  });
});

describe('testConsoleFindings', () => {
  it('reports each new message once per module, keyed by its text, with the test that printed it', () => {
    const findings = testConsoleFindings(
      [
        { file: ORDER_TEST, test: 'totals', messages: ['cache miss for order 42', ''] },
        { file: CART_TEST, test: '', messages: ['cache miss for order 7', 'late'] },
      ],
      { moduleRoot: 'shop' },
    );

    expect(findings).toEqual([
      {
        tool: 'test-runtime',
        rule: 'test-console-output',
        path: 'shop',
        identity: `console:${hash('cache miss for order <n>')}`,
        message: `Tests print new console output: "cache miss for order <n>" (${ORDER_TEST}, test "totals"). ${ADVICE} ${hint(ORDER_TEST)}`,
        classification: 'enforceable',
        tokens: ['cache', 'miss', 'for', 'order', '<n>'],
      },
      {
        tool: 'test-runtime',
        rule: 'test-console-output',
        path: 'shop',
        identity: `console:${hash('late')}`,
        message: `Tests print new console output: "late" (${CART_TEST}). ${ADVICE} ${hint(CART_TEST)}`,
        classification: 'enforceable',
      },
    ]);
  });

  it('skips allowed messages, by text alone or under the allowed paths', () => {
    const entries = [
      { file: ORDER_TEST, test: 'a', messages: ['HHH000104: firstResult/maxResults in memory'] },
      { file: CART_TEST, test: 'b', messages: ['legacy driver loaded 3 times'] },
      { file: ORDER_TEST, test: 'c', messages: ['legacy driver loaded 1 times'] },
    ];
    const allow = [
      { contains: 'firstResult/maxResults', reason: 'library' },
      { contains: 'legacy driver loaded 9 times', paths: ['**/CartTest.java'], reason: 'old' },
    ];

    expect(messagesOf(testConsoleFindings(entries, { allow }))).toEqual([
      '. Tests print new console output: "legacy driver loaded <n> times"',
    ]);
  });

  it('lifts a test file named by an exception in either rule form, under the module path', () => {
    const entries = [
      { file: ORDER_TEST, test: 'a', messages: ['order printed'] },
      { file: CART_TEST, test: 'b', messages: ['cart printed'] },
      { file: '.', test: '', messages: ['output of a test without source'] },
    ];
    const exceptions = [
      { rule: 'test-runtime/test-console-output', paths: ['api/**/OrderTest.java'] },
      { rule: 'test-console-output', glob: 'api/**/CartTest.java' },
    ];

    expect(
      messagesOf(testConsoleFindings(entries, { exceptions, modulePath: 'api', moduleRoot: '.' })),
    ).toEqual(['. Tests print new console output: "output of a test without source"']);
  });
});
