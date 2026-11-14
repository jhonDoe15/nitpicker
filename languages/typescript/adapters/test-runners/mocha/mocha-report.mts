import path from 'node:path';
import { textOf } from '../../../../../shared/values/readers.mts';
import type {
  AssertionResult,
  FailureDetail,
  TestFileResult,
  TestReport,
} from '../typed/runner-types.mts';

type MochaError = {
  readonly stack?: unknown;
  readonly message?: unknown;
  readonly expected?: unknown;
  readonly actual?: unknown;
};

type MochaTest = {
  readonly title?: string;
  readonly fullTitle?: string;
  readonly file?: string;
  readonly duration?: number;
  readonly err?: MochaError;
};

type MochaReport = {
  readonly tests?: readonly MochaTest[];
  readonly pending?: readonly MochaTest[];
  readonly failures?: readonly MochaTest[];
};

const LOAD_FAILURE_MARKER = 'Exception during run:';

function isMochaReport(value: unknown): value is MochaReport {
  return typeof value === 'object' && value !== null;
}

export function mochaReportOf(value: unknown): MochaReport {
  if (!isMochaReport(value)) {
    throw new TypeError('Mocha wrote a report that is not an object');
  }
  return value;
}

function errorMessage(error: MochaError = {}): string {
  return typeof error.stack === 'string' ? error.stack : textOf(error.message ?? 'failed');
}

function hasError(test: MochaTest): boolean {
  return Object.keys(test.err ?? {}).length > 0;
}

function testKey(test: MochaTest): string {
  return `${String(test.file)}\0${String(test.fullTitle)}`;
}

function testStatus(test: MochaTest, pending: ReadonlySet<string>): string {
  if (hasError(test)) {
    return 'failed';
  }
  return pending.has(testKey(test)) ? 'pending' : 'passed';
}

function failureDetails(error: MochaError = {}): {
  readonly failureDetails?: readonly FailureDetail[];
} {
  return 'expected' in error && 'actual' in error
    ? { failureDetails: [{ expected: error.expected, actual: error.actual, formatted: true }] }
    : {};
}

function assertionFor(test: MochaTest, pending: ReadonlySet<string>): AssertionResult {
  const status = testStatus(test, pending);
  return {
    fullName: test.fullTitle,
    title: test.title,
    status,
    failureMessages: status === 'failed' ? [errorMessage(test.err)] : [],
    ...(status === 'failed' ? failureDetails(test.err) : {}),
    duration: test.duration,
  };
}

function isHook(test: MochaTest): boolean {
  return /^"(?:before|after) (?:all|each)" hook/u.test(test.title ?? '');
}

function testFile(test: MochaTest, projectRoot: string): string | undefined {
  return test.file === undefined ? undefined : path.resolve(projectRoot, test.file);
}

function reportOf(testResults: readonly TestFileResult[]): TestReport {
  const assertions = testResults.flatMap(({ assertionResults = [] }) => assertionResults);
  return {
    numTotalTests: assertions.length,
    numFailedTests: assertions.filter(({ status }) => status === 'failed').length,
    testResults,
  };
}

export function reportFromMocha(mochaReport: MochaReport, projectRoot: string): TestReport {
  const pending = new Set((mochaReport.pending ?? []).map(testKey));
  const tests = [...(mochaReport.tests ?? []), ...(mochaReport.failures ?? []).filter(isHook)];
  const byFile = Map.groupBy(tests, (test) => testFile(test, projectRoot));
  return reportOf(
    [...byFile].map(([file, fileTests]) => {
      const assertionResults = fileTests.map((test) => assertionFor(test, pending));
      return {
        name: file,
        status: assertionResults.some(({ status }) => status === 'failed') ? 'failed' : 'passed',
        message: '',
        assertionResults,
      };
    }),
  );
}

function failedFile(output: string, testFiles: readonly string[]): string | undefined {
  const positions = testFiles
    .map((file) => ({ file, index: output.indexOf(file) }))
    .filter(({ index }) => index !== -1)
    .toSorted((left, right) => left.index - right.index);
  return positions[0]?.file ?? testFiles[0];
}

export function loadFailureReport(
  stderr: string,
  testFiles: readonly string[],
): TestReport | undefined {
  const start = stderr.indexOf(LOAD_FAILURE_MARKER);
  if (start === -1) {
    return undefined;
  }
  const output = stderr.slice(start + LOAD_FAILURE_MARKER.length).trim();
  return {
    numTotalTests: 0,
    numFailedTests: 0,
    testResults: [
      {
        name: failedFile(output, testFiles),
        status: 'failed',
        message: output,
        assertionResults: [],
      },
    ],
  };
}
