import { TESTS_FAILED_RULE } from '../../../../../shared/rules/finding-helpers.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const COVERAGE_REPORT_PATH = 'reports/quality/coverage/coverage-final.json';

import { normalizeCoverage } from './tests.mjs';

import { withBranchSourceHashes } from './source-hashes.mjs';

import { readHeadPolicy, readLayout } from '../../../preset/head-policy.mjs';
import { changedTestLines, slowTestFindings } from '../test-durations/slow-tests.mjs';
import {
  firstLine,
  missingSetupHints,
  timeoutText,
  unhandledErrors,
  unhandledErrorText,
  withSnapshotAdvice,
} from './failure-lines.mjs';

export function coverageFailureFindings(options, report, result) {
  const [firstFailure] = vitestFailures(report, options.projectRoot);
  const unhandled = unhandledErrors(result.stderr);
  if (firstFailure === undefined && unhandled.length > 0) {
    return [
      toolErrorFinding(options, {
        rule: TESTS_FAILED_RULE,
        path: unhandled[0].file === undefined ? '.' : findingPath(unhandled[0].file),
        message: unhandledErrorText(unhandled),
      }),
    ];
  }
  if (firstFailure === undefined) {
    throw new Error(
      `Vitest exited ${String(result.status)} without naming a failing test${formatProcessOutput(result)}`,
    );
  }
  return [
    toolErrorFinding(options, {
      rule: TESTS_FAILED_RULE,
      path: findingPath(firstFailure.file),
      message: formatVitestFailures(report, options.projectRoot),
    }),
  ];
}

export function readCoverageFindings(options, testReportPath) {
  const report = JSON.parse(
    readFileSync(path.join(options.projectRoot, COVERAGE_REPORT_PATH), 'utf8'),
  );
  const testReport = JSON.parse(readFileSync(testReportPath, 'utf8'));
  return [
    ...normalizeCoverage(
      withBranchSourceHashes(report, options.projectRoot),
      options.analyzerName,
      {
        projectRoot: options.projectRoot,
        testCount: testReport.numTotalTests,
      },
    ),
    ...(options.snapshot === 'base' ? [] : headSlowTests(options, testReport)),
  ];
}

function headSlowTests(options, testReport) {
  const { thresholds, exceptions } = readHeadPolicy();
  return slowTestFindings(testReport, {
    ...options,
    testRoots: readLayout().testRoots,
    thresholds,
    exceptions,
    changedLines: changedTestLines(options),
  });
}

export function readVitestReport(reportPath, result) {
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Vitest exited ${String(result.status)} without a readable test report: ${error instanceof Error ? error.message : String(error)}${formatProcessOutput(result)}`,
      { cause: error },
    );
  }
}

export function toolErrorFinding(options, { rule, path: findingPath = '.', message }) {
  return {
    tool: options.analyzerName,
    rule,
    path: findingPath,
    identity: rule,
    message,
    classification: 'tool-error',
  };
}

const MAX_LISTED_FAILURES = 5;

function vitestFailures(report, projectRoot) {
  const failures = [];
  const testResults = Array.isArray(report?.testResults) ? report.testResults : [];
  for (const testResult of testResults) {
    const file = projectFile(projectRoot, testResult?.name);
    const failedAssertions = Array.isArray(testResult?.assertionResults)
      ? testResult.assertionResults.filter((assertion) => assertion?.status === 'failed')
      : [];
    for (const assertion of failedAssertions) {
      failures.push({
        file,
        name: vitestAssertionName(assertion),
        assertion:
          timeoutText(assertion) ??
          withSnapshotAdvice(
            firstLine(assertion.failureMessages?.find((message) => typeof message === 'string')),
          ),
      });
    }
    if (failedAssertions.length === 0 && testResult?.status === 'failed') {
      failures.push({ file, name: 'could not run', assertion: firstLine(testResult.message) });
    }
  }
  return failures;
}

function projectFile(projectRoot, name) {
  if (typeof name !== 'string') {
    return '<unknown test file>';
  }
  const relativePath = path.relative(projectRoot, name).replaceAll('\\', '/');
  return relativePath.startsWith('..') || path.isAbsolute(relativePath) ? name : relativePath;
}

function findingPath(file) {
  return file.startsWith('<') || file.startsWith('..') || path.isAbsolute(file) ? '.' : file;
}

export function formatVitestFailures(report, projectRoot) {
  const failures = vitestFailures(report, projectRoot);
  const failedCount = Number.isInteger(report?.numFailedTests)
    ? Math.max(report.numFailedTests, failures.length)
    : failures.length;
  const headline = `${String(failedCount)} ${failedCount === 1 ? 'test fails' : 'tests fail'}, so coverage, CRAP and mutation were skipped. Fix the tests and rerun`;
  if (failures.length === 0) {
    return `${headline}; the report named no test.`;
  }
  const listed = failures
    .slice(0, MAX_LISTED_FAILURES)
    .map(
      ({ file, name, assertion }) =>
        `  ${file} > ${name}${assertion === '' ? '' : `: ${assertion}`}`,
    );
  const omitted = failures.length - listed.length;
  return [
    `${headline}:`,
    ...listed,
    ...(omitted > 0 ? [`  … and ${String(omitted)} more`] : []),
    ...missingSetupHints(failures),
  ].join('\n');
}

function vitestAssertionName(assertion) {
  if (typeof assertion.fullName === 'string') {
    return assertion.fullName;
  }
  if (typeof assertion.title === 'string') {
    return assertion.title;
  }
  return '<unknown test>';
}

function formatProcessOutput(result) {
  const output = [result.stderr, result.stdout]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .join('\n');
  return output.length > 0 ? `\nProcess output:\n${output}` : '';
}
