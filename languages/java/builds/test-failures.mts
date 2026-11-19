import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { testCaseProblem } from '../../../shared/ingest/common.mjs';
import { childrenNamed, parseXml } from '../../../shared/values/xml.mts';
import type { XmlElement } from '../../../shared/values/xml.mts';
import { explainedError } from '../../../shared/messages/troubleshooting.mjs';
import { testsFailHeadline } from '../../../shared/rules/finding-helpers.mjs';
import {
  failingTestEntries,
  valuesInMessage,
} from '../../../shared/rules/failing-tests/failing-tests.mjs';

export type CaseDetail = {
  readonly name: string;
  readonly message?: string;
  readonly file?: string;
  readonly line?: number;
  readonly expected?: string | undefined;
  readonly received?: string | undefined;
};
export type TestFailure = {
  readonly module: string;
  readonly tests: readonly string[];
  readonly details?: readonly CaseDetail[];
};
type CaseProblem = { readonly problem: XmlElement; readonly flaky: boolean };

const caseProblem: (
  testCase: XmlElement,
  options: { readonly flakyPasses: boolean },
) => CaseProblem | undefined = testCaseProblem;
const valuesOf: (text: unknown) => {
  expected?: string | undefined;
  received?: string | undefined;
} = valuesInMessage;
const entriesOf: (failures: readonly CaseDetail[]) => string[] = failingTestEntries;
const headline: (count: number, consequence: string, where: string) => string = testsFailHeadline;
const explained: (message: string) => Error = explainedError;

const MAX_LINE_LENGTH = 300;
const ROOT_MODULE = '.';
const TEST_REPORT = /^TEST-.*\.xml$/u;
const EXCEPTION_PREFIX = /^(?:[\w$]+\.)*[\w$]*(?:Error|Exception|Failure): /u;
const PARAMETER_LIST = /\(\)$/u;
const RERUN_PASS =
  'failed, then passed on a rerun (fix the flaky test; nitpicker counts a rerun as a failure)';

function firstLine(problem: XmlElement): string {
  const text = (problem.attrs['message'] ?? problem.attrs['type'] ?? '').replace(
    EXCEPTION_PREFIX,
    '',
  );
  return (text.split('\n').find((line) => line.trim() !== '') ?? '').trim();
}

const STACK_FRAME = /^\s*at (?:[^\s(]*\/)?([\w$.]+)\.[\w$<>-]+\(([^():]+):(\d+)\)/gmu;

function stackText(problem: XmlElement): string {
  const own = problem.text;
  if (own !== undefined && own !== '') {
    return own;
  }
  const recorded = childrenNamed(problem, 'stackTrace')[0]?.text;
  return recorded !== undefined && recorded !== '' ? recorded : '';
}

function assertionLocation(
  problem: XmlElement,
  className: string,
): { file?: string; line?: number } {
  for (const [, owner = '', file = '', line = ''] of stackText(problem).matchAll(STACK_FRAME)) {
    if (owner === className || owner.startsWith(`${className}$`)) {
      const packageEnd = className.lastIndexOf('.');
      const folder =
        packageEnd === -1 ? '' : `${className.slice(0, packageEnd).replaceAll('.', '/')}/`;
      return { file: `${folder}${file}`, line: Number(line) };
    }
  }
  return {};
}

function caseEntry(
  suite: XmlElement,
  testCase: XmlElement,
  { problem, flaky }: CaseProblem,
): { text: string; detail: CaseDetail } {
  const className = testCase.attrs['classname'] ?? suite.attrs['name'] ?? '';
  const where = `${className}.${(testCase.attrs['name'] ?? '').replace(PARAMETER_LIST, '')}`;
  const firstMessage = firstLine(problem);
  const message = flaky ? `${RERUN_PASS}: ${firstMessage}` : firstMessage;
  return {
    text: `${where}: ${message}`,
    detail: {
      name: where,
      message: cutLine(message),
      ...assertionLocation(problem, className),
      ...valuesOf(problem.attrs['message']),
    },
  };
}

export function failedCaseEntries(
  file: string,
  { retriesPass }: { readonly retriesPass: boolean } = { retriesPass: false },
): { text: string; detail: CaseDetail }[] {
  const root = parseXml(readFileSync(file, 'utf8'));
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  return suites.flatMap((suite) =>
    childrenNamed(suite, 'testcase').flatMap((testCase) => {
      const found = caseProblem(testCase, { flakyPasses: retriesPass });
      return found === undefined ? [] : [caseEntry(suite, testCase, found)];
    }),
  );
}

export function failedCases(file: string): string[] {
  return failedCaseEntries(file).map(({ text }) => text);
}

export function freshReports(directory: string, since: number): string[] {
  return existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => TEST_REPORT.test(name))
        .map((name) => path.join(directory, name))
        .filter((file) => statSync(file).mtimeMs >= since)
    : [];
}

function listedFailures(failures: readonly TestFailure[]): string[] {
  return entriesOf(
    failures.flatMap(({ tests, details = [] }) =>
      tests.map((test, index) => details[index] ?? { name: test }),
    ),
  ).map((line) => cutLine(line));
}

function cutLine(line: string): string {
  return line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}…` : line;
}

export function moduleName(directory: string): string {
  return directory === '' ? ROOT_MODULE : directory;
}

function modulesOf(failures: readonly TestFailure[]): string {
  const modules = failures.map(({ module }) => module).filter((module) => module !== ROOT_MODULE);
  return modules.length === 0 ? '' : ` in ${modules.join(', ')}`;
}

export function failingTestsText(failures: readonly TestFailure[], consequence: string): string {
  const count = failures.reduce((total, { tests }) => total + tests.length, 0);
  return [headline(count, consequence, modulesOf(failures)), ...listedFailures(failures)].join(
    '\n',
  );
}

export function failingTestsError(failures: readonly TestFailure[]): Error {
  const error = explained(failingTestsText(failures, 'the build stopped, so no other check ran'));
  return Object.defineProperty(error, 'failures', { value: failures });
}
