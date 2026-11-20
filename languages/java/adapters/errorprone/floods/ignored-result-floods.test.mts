import { describe, expect, it } from 'vitest';
import { IGNORED_RESULT_FLOOD, withGroupedTestCalls } from './ignored-result-floods.mts';

const TESTS = 'src/test/java';

function ignored(file: string, line: number, call = 'get(...)') {
  return {
    tool: 'errorprone',
    rule: 'CheckReturnValue',
    path: file,
    message: `The result of \`${call}\` must be used. Use the result, or make the method return void.`,
    allowedForm: 'Use the result, or make the method return void if callers do not need it.',
    location: { line, column: 5 },
  };
}

function sites(count: number, file: (index: number) => string, call?: string) {
  return Array.from({ length: count }, (_, index) => ignored(file(index), index + 1, call));
}

function grouped(findings: readonly Readonly<Record<string, unknown>>[]) {
  return withGroupedTestCalls(findings, (file) => file.startsWith(`${TESTS}/`));
}

describe('ignored results of one method across the tests', () => {
  it('reports a method ignored at many test call sites once, at the first site', () => {
    const findings = [
      ...sites(IGNORED_RESULT_FLOOD, (index) => `${TESTS}/shop/B${String(index % 3)}Test.java`),
      ignored(`${TESTS}/shop/ATest.java`, 40),
      ignored(`${TESTS}/shop/ATest.java`, 12),
    ];

    const result = grouped(findings);

    expect([result.length, result[0]?.['path'], result[0]?.['location']]).toEqual([
      1,
      `${TESTS}/shop/ATest.java`,
      { line: 12, column: 5 },
    ]);
    expect(result[0]?.['message']).toBe(
      `The tests ignore the result of \`get(...)\` here and at ${String(IGNORED_RESULT_FLOOD + 1)} other call ` +
        'sites, so the call is made for its effect (it records, sends or builds). Annotate the method with ' +
        '@CanIgnoreReturnValue (com.google.errorprone.annotations) when the call itself is the checked ' +
        'action, or use the results.',
    );
  });

  it('keeps every site below the limit, and counts each call text on its own', () => {
    const findings = [
      ...sites(IGNORED_RESULT_FLOOD - 1, () => `${TESTS}/shop/OrderTest.java`),
      ...sites(IGNORED_RESULT_FLOOD - 1, () => `${TESTS}/shop/OrderTest.java`, 'post(...)'),
    ];

    expect(grouped(findings)).toEqual(findings);
  });

  it('keeps every site in main sources and every other rule', () => {
    const main = sites(IGNORED_RESULT_FLOOD + 5, () => 'src/main/java/shop/Orders.java');
    const other = sites(IGNORED_RESULT_FLOOD + 5, () => `${TESTS}/shop/OrderTest.java`).map(
      (finding) => ({ ...finding, rule: 'FutureReturnValueIgnored' }),
    );

    expect(grouped([...main, ...other])).toEqual([...main, ...other]);
  });
});
