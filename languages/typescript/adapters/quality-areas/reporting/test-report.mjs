import { TESTS_FAILED_RULE } from '../../../../../shared/rules/finding-helpers.mjs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const COVERAGE_REPORT_PATH = 'reports/quality/coverage/coverage-final.json';
export const FAILING_TEST_FILES_PATH = 'reports/quality/coverage/failing-test-files.json';
const TESTS_TOOL = 'tests';

import { normalizeCoverage } from './tests.mjs';

import { withBranchSourceHashes } from './source-hashes.mjs';

import { firstLine, missingSetupHints } from './failure-lines.mjs';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';

export function coverageFailureFindings(
  options,
  { report, result, runnerName, precedingCommands },
) {
  const [firstFailure] = testFailures(report, options.projectRoot);
  if (firstFailure === undefined) {
    throw new Error(
      `${runnerName} exited ${String(result.status)} without naming a failing test${formatProcessOutput(result)}`,
    );
  }
  return [
    toolErrorFinding(options, {
      rule: TESTS_FAILED_RULE,
      path: findingPath(firstFailure.file),
      message: formatTestFailures(report, options.projectRoot, { runnerName, precedingCommands }),
    }),
  ];
}

export function testsFailedFinding(options, { report, runnerName, precedingCommands }) {
  const [firstFailure] = testFailures(report, options.projectRoot);
  return {
    ...toolErrorFinding(options, {
      rule: TESTS_FAILED_RULE,
      path: findingPath(firstFailure?.file ?? '<unknown test file>'),
      message: formatTestFailures(report, options.projectRoot, {
        runnerName,
        precedingCommands,
        partial: true,
      }),
    }),
    tool: TESTS_TOOL,
  };
}

export function failingTestFiles(report, projectRoot) {
  const files = testFailures(report, projectRoot)
    .map(({ file }) => file)
    .filter((file) => findingPath(file) !== '.');
  return [...new Set(files)].toSorted();
}

export function hasPassingTests(report) {
  return report.numTotalTests - (report.numFailedTests ?? 0) > 0;
}

export function readFailingTestFiles(projectRoot) {
  const file = path.join(projectRoot, FAILING_TEST_FILES_PATH);
  if (!existsSync(file)) {
    return [];
  }
  const files = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(files) ? files.filter((entry) => typeof entry === 'string') : [];
}

export function readCoverageFindings(options, testReport) {
  const report = JSON.parse(
    readFileSync(path.join(options.projectRoot, COVERAGE_REPORT_PATH), 'utf8'),
  );
  return normalizeCoverage(
    withBranchSourceHashes(report, options.projectRoot),
    options.analyzerName,
    { projectRoot: options.projectRoot, testCount: testReport.numTotalTests },
  );
}

export function readTestReport(reportPath, result, runnerName) {
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${runnerName} exited ${String(result.status)} without a readable test report: ${reason}${formatProcessOutput(result)}`,
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

function testFailures(report, projectRoot) {
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
        name: assertionName(assertion),
        assertion: firstLine(
          assertion.failureMessages?.find((message) => typeof message === 'string'),
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

function precedingNote(precedingCommands) {
  if (!Array.isArray(precedingCommands) || precedingCommands.length === 0) {
    return [];
  }
  const steps = precedingCommands.map((command) => `"${command}"`).join(', ');
  const which = precedingCommands.length === 1 ? 'that step' : 'those steps';
  return [
    `The test script runs ${steps} before the tests; nitpicker runs only the test command, ` +
      `so run ${which} first if the tests need it.`,
  ];
}

export function formatTestFailures(
  report,
  projectRoot,
  { runnerName, precedingCommands, partial = false } = {},
) {
  return [
    failureText(report, projectRoot, { runnerName, partial }),
    ...precedingNote(precedingCommands),
  ].join('\n');
}

function failureText(report, projectRoot, { runnerName, partial }) {
  const failures = testFailures(report, projectRoot);
  const failedCount = Number.isInteger(report?.numFailedTests)
    ? Math.max(report.numFailedTests, failures.length)
    : failures.length;
  const consequence = partial
    ? '. Coverage and CRAP come from the tests that ran, and mutation leaves out the test files that fail'
    : ', so coverage, CRAP and mutation were skipped';
  const headline = `${String(failedCount)} ${failedCount === 1 ? 'test fails' : 'tests fail'}${consequence}. Fix the tests and rerun`;
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
    ...(runnerName === RUNNER_NAMES.vitest ? missingSetupHints(failures) : []),
  ].join('\n');
}

function assertionName(assertion) {
  if (typeof assertion.fullName === 'string') {
    return assertion.fullName;
  }
  if (typeof assertion.title === 'string') {
    return assertion.title;
  }
  return '<unknown test>';
}

export function formatProcessOutput(result) {
  const output = [result.stderr, result.stdout]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .join('\n');
  return output.length > 0 ? `\nProcess output:\n${output}` : '';
}
