import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { childrenNamed, parseXml, testCaseProblem } from '../../../shared/ingest/common.mjs';

const MAX_LISTED_FAILURES = 10;
const ROOT_MODULE = '.';
const TEST_REPORT = /^TEST-.*\.xml$/u;
const EXCEPTION_PREFIX = /^(?:[\w$]+\.)*[\w$]*(?:Error|Exception|Failure): /u;
const PARAMETER_LIST = /\(\)$/u;
const RERUN_PASS =
  'failed, then passed on a rerun (fix the flaky test; nitpicker counts a rerun as a failure)';

function firstLine(problem) {
  return (problem.attrs.message ?? problem.attrs.type ?? '').split('\n')[0];
}

export function failedCases(file) {
  const root = parseXml(readFileSync(file, 'utf8'));
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  return suites.flatMap((suite) =>
    childrenNamed(suite, 'testcase').flatMap((testCase) => {
      const found = testCaseProblem(testCase);
      if (found === undefined) {
        return [];
      }
      const name = testCase.attrs.name.replace(PARAMETER_LIST, '');
      const message = firstLine(found.problem).replace(EXCEPTION_PREFIX, '');
      const where = `${testCase.attrs.classname ?? suite.attrs.name}.${name}`;
      return [found.flaky ? `${where}: ${RERUN_PASS}: ${message}` : `${where}: ${message}`];
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
  const lines = failures.flatMap(({ tests }) => tests);
  const listed = lines.slice(0, MAX_LISTED_FAILURES).map((line) => `  ${line}`);
  const more =
    lines.length > MAX_LISTED_FAILURES
      ? [`  and ${String(lines.length - MAX_LISTED_FAILURES)} more`]
      : [];
  return [...listed, ...more];
}

export function moduleName(directory) {
  return directory === '' ? ROOT_MODULE : directory;
}

export function failingTestsError(where, failures) {
  const error = new Error(
    [
      `Tests fail in ${where}; nitpicker needs a passing test suite for coverage and mutation testing:`,
      ...listedFailures(failures),
    ].join('\n'),
  );
  return Object.defineProperty(error, 'failures', { value: failures });
}
