import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { childrenNamed, parseXml, testCaseProblem } from '../../../shared/ingest/common.mjs';
import { explainedError } from '../../../shared/messages/troubleshooting.mjs';
import { testsFailHeadline } from '../../../shared/rules/finding-helpers.mjs';
import {
  failingTestEntries,
  valuesInMessage,
} from '../../../shared/rules/failing-tests/failing-tests.mjs';

const MAX_LINE_LENGTH = 300;
const ROOT_MODULE = '.';
const TEST_REPORT = /^TEST-.*\.xml$/u;
const EXCEPTION_PREFIX = /^(?:[\w$]+\.)*[\w$]*(?:Error|Exception|Failure): /u;
const PARAMETER_LIST = /\(\)$/u;
const RERUN_PASS =
  'failed, then passed on a rerun (fix the flaky test; nitpicker counts a rerun as a failure)';

function firstLine(problem) {
  const text = (problem.attrs.message ?? problem.attrs.type ?? '').replace(EXCEPTION_PREFIX, '');
  return (text.split('\n').find((line) => line.trim() !== '') ?? '').trim();
}

const STACK_FRAME = /^\s*at (?:[^\s(]*\/)?([\w$.]+)\.[\w$<>-]+\(([^():]+):(\d+)\)/gmu;

function stackText(problem) {
  return problem.text || childrenNamed(problem, 'stackTrace')[0]?.text || '';
}

function assertionLocation(problem, className) {
  for (const [, owner, file, line] of stackText(problem).matchAll(STACK_FRAME)) {
    if (owner === className || owner.startsWith(`${className}$`)) {
      const packageEnd = className.lastIndexOf('.');
      const folder =
        packageEnd === -1 ? '' : `${className.slice(0, packageEnd).replaceAll('.', '/')}/`;
      return { file: `${folder}${file}`, line: Number(line) };
    }
  }
  return {};
}

function caseEntry(suite, testCase, { problem, flaky }) {
  const className = testCase.attrs.classname ?? suite.attrs.name;
  const where = `${className}.${testCase.attrs.name.replace(PARAMETER_LIST, '')}`;
  const firstMessage = firstLine(problem);
  const message = flaky ? `${RERUN_PASS}: ${firstMessage}` : firstMessage;
  return {
    text: `${where}: ${message}`,
    detail: {
      name: where,
      message: cutLine(message),
      ...assertionLocation(problem, className),
      ...valuesInMessage(problem.attrs.message),
    },
  };
}

export function failedCaseEntries(file) {
  const root = parseXml(readFileSync(file, 'utf8'));
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  return suites.flatMap((suite) =>
    childrenNamed(suite, 'testcase').flatMap((testCase) => {
      const found = testCaseProblem(testCase);
      return found === undefined ? [] : [caseEntry(suite, testCase, found)];
    }),
  );
}

export function failedCases(file) {
  return failedCaseEntries(file).map(({ text }) => text);
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
  return failingTestEntries(
    failures.flatMap(({ tests, details = [] }) =>
      tests.map((test, index) => details[index] ?? { name: test }),
    ),
  ).map((line) => cutLine(line));
}

function cutLine(line) {
  return line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}…` : line;
}

export function moduleName(directory) {
  return directory === '' ? ROOT_MODULE : directory;
}

function modulesOf(failures) {
  const modules = failures.map(({ module }) => module).filter((module) => module !== ROOT_MODULE);
  return modules.length === 0 ? '' : ` in ${modules.join(', ')}`;
}

export function failingTestsText(failures, consequence) {
  const count = failures.reduce((total, { tests }) => total + tests.length, 0);
  return [
    testsFailHeadline(count, consequence, modulesOf(failures)),
    ...listedFailures(failures),
  ].join('\n');
}

export function failingTestsError(failures) {
  const error = explainedError(
    failingTestsText(failures, 'the build stopped, so no other check ran'),
  );
  return Object.defineProperty(error, 'failures', { value: failures });
}
