import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { childrenNamed, parseXml } from '../../../shared/ingest/common.mjs';

const MAX_LISTED_FAILURES = 10;
const TEST_REPORT = /^TEST-.*\.xml$/u;

export function failedCases(file) {
  const root = parseXml(readFileSync(file, 'utf8'));
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  return suites.flatMap((suite) =>
    childrenNamed(suite, 'testcase')
      .filter(
        (testCase) =>
          childrenNamed(testCase, 'failure').length + childrenNamed(testCase, 'error').length > 0,
      )
      .map((testCase) => {
        const problem = [
          ...childrenNamed(testCase, 'failure'),
          ...childrenNamed(testCase, 'error'),
        ][0];
        const message = (problem.attrs.message ?? problem.attrs.type ?? '').split('\n')[0];
        return `${testCase.attrs.classname ?? suite.attrs.name}.${testCase.attrs.name}: ${message}`;
      }),
  );
}

export function freshReports(directory, since) {
  return existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => TEST_REPORT.test(name))
        .map((name) => path.join(directory, name))
        .filter((file) => statSync(file).mtimeMs >= since)
    : [];
}

function listedFailures(failures) {
  const listed = failures.slice(0, MAX_LISTED_FAILURES).map((failure) => `  ${failure}`);
  const more =
    failures.length > MAX_LISTED_FAILURES
      ? [`  and ${String(failures.length - MAX_LISTED_FAILURES)} more`]
      : [];
  return [...listed, ...more];
}

export function failingTestsNote(where, failures) {
  return [`Tests fail in ${where}:`, ...listedFailures(failures)].join('\n');
}

export function failingTestsError(where, failures) {
  const error = new Error(
    [
      `Tests fail in ${where}; nitpicker needs a passing test suite for coverage and mutation testing:`,
      ...listedFailures(failures),
    ].join('\n'),
  );
  return Object.defineProperty(error, 'detail', { value: failingTestsNote(where, failures) });
}
