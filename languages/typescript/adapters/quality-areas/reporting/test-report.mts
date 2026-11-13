import {
  TESTS_FAILED_RULE,
  TESTS_NOT_RUN_RULE,
} from '../../../../../shared/rules/finding-helpers.mjs';
import { troubleshootingError, withTroubleshooting } from '../../lint-engine/typed/tools.mts';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Finding, NodeToolResult } from '../../static-checks/shared.mts';
import type { QualityAreaOptions } from '../typed/area-types.mts';
import type {
  AssertionResult,
  TestFileResult,
  TestReport,
} from '../../test-runners/typed/runner-types.mts';
import {
  failingTestEntries,
  testsFailAnchor,
  testsFailHeadline,
  testsFailOnBase,
} from '../typed/reporting.mts';
import { listOf, textOf } from '../../../../../shared/values/readers.mts';
import type { CoverageReport } from './tests.mts';

export const COVERAGE_REPORT_PATH = 'reports/quality/coverage/coverage-final.json';

export const TEST_CONSOLE_REPORT_PATH = 'reports/quality/test-console/report.json';

import { normalizeCoverage } from './tests.mts';

import { withBranchSourceHashes } from './source-hashes.mts';

import {
  type ReportedAssertion,
  firstLine,
  missingSetupHints,
  timeoutText,
  unhandledErrors,
  unhandledErrorText,
  withSnapshotAdvice,
  assertionDetails,
} from './failure-lines.mts';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';

export type ToolErrorDetails = {
  readonly rule: string;
  readonly path?: string | undefined;
  readonly message: string;
  readonly anchor: string | undefined;
};

export type ProjectTestRun = {
  readonly report: TestReport;
  readonly result: NodeToolResult;
  readonly runnerName: string;
  readonly precedingCommands: unknown;
};

type Failure = {
  readonly file: string;
  readonly name: string;
  readonly assertion: string;
  readonly line?: number;
  readonly expected?: unknown;
  readonly received?: unknown;
};

type FailureContext = {
  readonly runnerName?: string | undefined;
  readonly precedingCommands?: unknown;
  readonly snapshot?: string | undefined;
};

type ProcessOutput = { readonly stderr?: unknown; readonly stdout?: unknown };

const COULD_NOT_RUN = 'could not run';

function hasEntries<T>(list: readonly T[]): list is readonly [T, ...T[]] {
  return list.length > 0;
}

function isCoverageReport(value: unknown): value is CoverageReport {
  return typeof value === 'object' && value !== null;
}

export function coverageFailureFindings(
  options: QualityAreaOptions,
  { report, result, runnerName, precedingCommands }: ProjectTestRun,
): Finding[] {
  const failures = testFailures(report, options.projectRoot);
  const [firstFailure] = failures;
  const unhandled = unhandledErrors(result.stderr);
  if (firstFailure === undefined && hasEntries(unhandled)) {
    return [
      toolErrorFinding(options, {
        rule: TESTS_NOT_RUN_RULE,
        path: unhandled[0].file === undefined ? '.' : findingPath(unhandled[0].file),
        message: unhandledErrorText(unhandled),
        anchor: testsFailAnchor(options.snapshot),
      }),
    ];
  }
  if (firstFailure === undefined) {
    throw troubleshootingError(
      `${runnerName} exited ${String(result.status)} without naming a failing test${formatProcessOutput(result)}`,
      testsFailAnchor(options.snapshot),
    );
  }
  const ran = failures.some(({ name }) => name !== COULD_NOT_RUN);
  return [
    toolErrorFinding(options, {
      rule: ran ? TESTS_FAILED_RULE : TESTS_NOT_RUN_RULE,
      path: findingPath(firstFailure.file),
      message: formatTestFailures(report, options.projectRoot, {
        runnerName,
        precedingCommands,
        snapshot: ran ? options.snapshot : undefined,
      }),
      anchor: testsFailAnchor(options.snapshot),
    }),
  ];
}

export function readCoverageFindings(
  options: QualityAreaOptions,
  testReport: TestReport,
): Finding[] {
  const report: unknown = JSON.parse(
    readFileSync(path.join(options.projectRoot, COVERAGE_REPORT_PATH), 'utf8'),
  );
  if (!isCoverageReport(report)) {
    throw new TypeError('The coverage report is not an object');
  }
  return normalizeCoverage(
    withBranchSourceHashes(report, options.projectRoot),
    options.analyzerName,
    { projectRoot: options.projectRoot, testCount: testReport.numTotalTests },
  );
}

export function readTestReport(
  reportPath: string,
  result: NodeToolResult,
  { runnerName, snapshot }: { readonly runnerName: string; readonly snapshot: string | undefined },
): unknown {
  try {
    const report: unknown = JSON.parse(readFileSync(reportPath, 'utf8'));
    return report;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw troubleshootingError(
      `${runnerName} exited ${String(result.status)} without a readable test report: ${reason}${formatProcessOutput(result)}`,
      testsFailAnchor(snapshot),
      { cause: error },
    );
  }
}

export function toolErrorFinding(
  options: Pick<QualityAreaOptions, 'analyzerName'>,
  { rule, path: findingPath = '.', message, anchor }: ToolErrorDetails,
): Finding {
  return {
    tool: options.analyzerName,
    rule,
    path: findingPath,
    identity: rule,
    message: anchor === undefined ? message : withTroubleshooting(message, anchor),
    classification: 'tool-error',
  };
}

function isFailedAssertion(assertion: AssertionResult | undefined): assertion is AssertionResult {
  return assertion?.status === 'failed';
}

function testFailures(report: TestReport | undefined, projectRoot: string): Failure[] {
  const failures: Failure[] = [];
  const testResults: readonly (TestFileResult | undefined)[] = Array.isArray(report?.testResults)
    ? report.testResults
    : [];
  for (const testResult of testResults) {
    const file = projectFile(projectRoot, testResult?.name);
    const assertions: readonly (AssertionResult | undefined)[] = Array.isArray(
      testResult?.assertionResults,
    )
      ? testResult.assertionResults
      : [];
    const failedAssertions = assertions.filter(isFailedAssertion);
    for (const assertion of failedAssertions) {
      failures.push({
        file,
        ...assertionDetails(reportedAssertion(assertion), {
          testFile: absoluteFile(projectRoot, testResult?.name),
          projectRoot,
        }),
        name: assertionName(assertion),
        assertion:
          timeoutText(reportedAssertion(assertion)) ??
          withSnapshotAdvice(
            firstLine(assertion.failureMessages?.find((message) => typeof message === 'string')),
          ),
      });
    }
    if (failedAssertions.length === 0 && testResult?.status === 'failed') {
      failures.push({ file, name: COULD_NOT_RUN, assertion: firstLine(testResult.message) });
    }
  }
  return failures;
}

function reportedAssertion(assertion: AssertionResult): ReportedAssertion {
  return assertion;
}

function absoluteFile(projectRoot: string, name: unknown): string | undefined {
  return typeof name === 'string' ? path.resolve(projectRoot, name) : undefined;
}

function projectFile(projectRoot: string, name: unknown): string {
  if (typeof name !== 'string') {
    return '<unknown test file>';
  }
  const relativePath = path.relative(projectRoot, name).replaceAll('\\', '/');
  return relativePath.startsWith('..') || path.isAbsolute(relativePath) ? name : relativePath;
}

function findingPath(file: string): string {
  return file.startsWith('<') || file.startsWith('..') || path.isAbsolute(file) ? '.' : file;
}

function precedingNote(precedingCommands: unknown): string[] {
  const commands = listOf(precedingCommands);
  if (commands.length === 0) {
    return [];
  }
  const steps = commands.map((command) => `"${textOf(command)}"`).join(', ');
  const which = commands.length === 1 ? 'that step' : 'those steps';
  return [
    `The test script runs ${steps} before the tests; nitpicker runs only the test command, ` +
      `so run ${which} first if the tests need it.`,
  ];
}

function failureEntry({ file, name, assertion }: Failure): string {
  return `${file} > ${name}${assertion === '' ? '' : `: ${assertion}`}`;
}

export function formatTestFailures(
  report: TestReport | undefined,
  projectRoot: string,
  { runnerName, precedingCommands, snapshot }: FailureContext = {},
): string {
  if (snapshot === 'base') {
    return testsFailOnBase(testFailures(report, projectRoot).map(failureEntry));
  }
  return [failureText(report, projectRoot, runnerName), ...precedingNote(precedingCommands)].join(
    '\n',
  );
}

function failureText(
  report: TestReport | undefined,
  projectRoot: string,
  runnerName: string | undefined,
): string {
  const failures = testFailures(report, projectRoot);
  const failedCount =
    typeof report?.numFailedTests === 'number' && Number.isInteger(report.numFailedTests)
      ? Math.max(report.numFailedTests, failures.length)
      : failures.length;
  const headline = testsFailHeadline(failedCount, 'coverage, CRAP and mutation were skipped');
  if (failures.length === 0) {
    return `${headline.slice(0, -1)}; the report named no test.`;
  }
  return [
    headline,
    ...failingTestEntries(
      failures.map(({ assertion, ...failure }) => ({ ...failure, message: assertion })),
    ),
    ...(runnerName === RUNNER_NAMES.vitest ? missingSetupHints(failures) : []),
  ].join('\n');
}

function assertionName(assertion: AssertionResult): string {
  if (typeof assertion.fullName === 'string') {
    return assertion.fullName;
  }
  if (typeof assertion.title === 'string') {
    return assertion.title;
  }
  return '<unknown test>';
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function formatProcessOutput(result: ProcessOutput): string {
  const output = [result.stderr, result.stdout]
    .filter(hasText)
    .map((value) => value.trim())
    .join('\n');
  return output.length > 0 ? `\nProcess output:\n${output}` : '';
}
