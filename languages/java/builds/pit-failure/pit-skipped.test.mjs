import { existsSync, mkdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPit } from '../../maven/pit/maven-pit.mts';
import { pitFailureFindings } from './pit-failure.mjs';
import { pitSkippedFindings, unmutatedFailures, unmutatedSummary } from './pit-skipped.mjs';

const roots = [];

function pitLine(testClass, method) {
  return (
    `PIT >> SEVERE : Description [testClass=org.jsoup.helper.${testClass}, ` +
    `name=[engine:junit-jupiter]/[class:org.jsoup.helper.${testClass}]/[method:${method}()]] ` +
    'did not pass without mutation.'
  );
}

function failingOutput(count, testClass = 'HttpClientExecutorTest') {
  const lines = Array.from({ length: count }, (_, index) => pitLine(testClass, `case${index}`));
  return `Running\n${lines.join('\n')}\nat org.pitest.Main\n`;
}

function moduleTree() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pit-skipped-'));
  roots.push(root);
  for (const file of ['classes/demo/A.class', 'test-classes/demo/ATest.class']) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
  const module = {
    basedir: root,
    outputDirectory: path.join(root, 'classes'),
    testOutputDirectory: path.join(root, 'test-classes'),
    sourceRoots: [],
    testJvmArgs: [],
  };
  return { root, module };
}

function runWith(results, deadline) {
  const { root, module } = moduleTree();
  const calls = [];
  runPit({
    module,
    reportDir: root,
    tools: { pit: [] },
    classpaths: { testRuntime: [] },
    isArchunit: () => false,
    spawn: (_java, args) => {
      calls.push([readFileSync(args[0].slice(1), 'utf8')]);
      const result = results[Math.min(calls.length, results.length) - 1];
      return typeof result === 'function' ? result() : result;
    },
    timeoutMs: 15 * 60_000,
    deadline,
  });
  return { root, calls };
}

const FAILED = { status: 1, stdout: failingOutput(15), stderr: '' };
const PASSED = { status: 0, stdout: '', stderr: '' };

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const SUMMARY_15 =
  "15 tests in HttpClientExecutorTest did not pass without mutation under PIT; they pass under the build's test task";
const SEE_TROUBLESHOOTING =
  'See https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md#pit-fails-or-times-out';

function skippedNotice(count, symbol) {
  return {
    tool: 'pit',
    rule: 'pit-skipped-tests',
    path: '.',
    identity: `pit-skipped-tests:${symbol}`,
    symbol,
    message:
      `${String(count)} tests in HttpClientExecutorTest did not pass without mutation under PIT; ` +
      "they pass under the build's test task. PIT ran again without them " +
      '(HttpClientExecutorTest.case0(), HttpClientExecutorTest.case1(), HttpClientExecutorTest.case2(), ' +
      `HttpClientExecutorTest.case3(), HttpClientExecutorTest.case4() and ${String(count - 5)} more), ` +
      'so the mutation findings come from the remaining tests, ' +
      'and mutants only the skipped tests would kill may count as surviving',
    classification: 'descriptive',
  };
}

function pitFailure(message, separator = '. ') {
  return {
    tool: 'pit',
    rule: 'pit-failure',
    path: '.',
    identity: 'pit-failure:.',
    symbol: '.',
    message: `${message}${separator}${SEE_TROUBLESHOOTING}`,
    classification: 'tool-error',
  };
}

describe('the tests that do not pass without mutation', () => {
  it('are named once, with a one-line summary', () => {
    const tests = unmutatedFailures(failingOutput(15) + failingOutput(1, 'OtherTest'));

    expect(tests).toHaveLength(16);
    expect(tests[0].label).toBe('HttpClientExecutorTest.case0()');
    expect([
      unmutatedSummary(tests.slice(0, 15)),
      unmutatedSummary(tests),
      unmutatedSummary(tests.slice(0, 1)),
    ]).toEqual([
      SUMMARY_15,
      "16 tests in 2 test classes did not pass without mutation under PIT; they pass under the build's test task",
      "1 test in HttpClientExecutorTest did not pass without mutation under PIT; it passes under the build's test task",
    ]);
  });
});

describe('PIT on Maven when tests fail without mutation', () => {
  it('runs again with --skipFailingTests and reports a notice that names the skipped tests', () => {
    const { root, calls } = runWith([FAILED, PASSED]);

    expect(calls.map(([args]) => args.includes('--skipFailingTests'))).toEqual([false, true]);
    expect(existsSync(path.join(root, 'pit', 'mutations.xml'))).toBe(true);
    expect(pitFailureFindings(root)).toEqual([]);
    expect(pitSkippedFindings(root, 'shop')).toEqual([skippedNotice(15, 'shop')]);
  });

  it('finds every failing test behind a long stack trace on stderr', () => {
    const trace = Array.from({ length: 60 }, (_, index) => `\tat Frame${String(index)}`).join('\n');
    const { root, calls } = runWith([
      { status: 1, stdout: failingOutput(45), stderr: trace },
      PASSED,
    ]);

    expect([calls.length, pitSkippedFindings(root)]).toEqual([2, [skippedNotice(45, '.')]]);
  });

  it('keeps the pit-failure error, led by the summary, when the second run fails too', () => {
    const { root, calls } = runWith([FAILED, { status: 1, stdout: 'second\n', stderr: '' }]);

    expect(calls).toHaveLength(2);
    expect(pitSkippedFindings(root)).toEqual([]);
    expect(pitFailureFindings(root)).toEqual([
      pitFailure(`${SUMMARY_15}. PIT failed with exit code 1: second`),
    ]);
  });

  it('does not run again after another kind of failure', () => {
    const { root, calls } = runWith([{ status: 1, stdout: 'boom\n', stderr: '' }]);

    expect(calls).toHaveLength(1);
    expect(pitFailureFindings(root)).toEqual([pitFailure('PIT failed with exit code 1: boom')]);
  });

  it('does not run again with less than a minute left, and keeps the first failure', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const slow = () => {
      vi.setSystemTime(40_000);
      return FAILED;
    };

    const { root, calls } = runWith([slow, PASSED], 90_000);

    expect(calls).toHaveLength(1);
    expect(pitSkippedFindings(root)).toEqual([]);
    expect(pitFailureFindings(root)).toEqual([
      pitFailure(`${SUMMARY_15}. PIT failed with exit code 1: ${FAILED.stdout.trimEnd()}`, '\n'),
    ]);
  });
});
