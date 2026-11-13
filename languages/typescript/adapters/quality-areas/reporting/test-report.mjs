import {
  TESTS_FAILED_RULE,
  TESTS_NOT_RUN_RULE,
  testsFailHeadline,
  testsFailOnBase,
} from '../../../../../shared/rules/finding-helpers.mjs';
import {
  testsFailAnchor,
  troubleshootingError,
  withTroubleshooting,
} from '../../../../../shared/messages/troubleshooting.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const COVERAGE_REPORT_PATH = 'reports/quality/coverage/coverage-final.json';

export const TEST_CONSOLE_REPORT_PATH = 'reports/quality/test-console/report.json';

import { normalizeCoverage } from './tests.mjs';

import { withBranchSourceHashes } from './source-hashes.mjs';

import {
  firstLine,
  missingSetupHints,
  timeoutText,
  unhandledErrors,
  unhandledErrorText,
  withSnapshotAdvice,
  assertionDetails,
} from './failure-lines.mjs';
import { failingTestEntries } from '../../../../../shared/rules/failing-tests/failing-tests.mjs';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mjs';

const COULD_NOT_RUN = 'could not run';

export function coverageFailureFindings(
  options,
  { report, result, runnerName, precedingCommands },
  { mockPin = false } = {},
) {
  const failures = testFailures(report, options.projectRoot);
  const [firstFailure] = failures;
  const unhandled = unhandledErrors(result.stderr);
  if (firstFailure === undefined && unhandled.length > 0) {
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
        mockPin: ran && mockPin,
      }),
      anchor: testsFailAnchor(options.snapshot),
    }),
  ];
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

export function readTestReport(reportPath, result, { runnerName, snapshot }) {
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw troubleshootingError(
      `${runnerName} exited ${String(result.status)} without a readable test report: ${reason}${formatProcessOutput(result)}`,
      testsFailAnchor(snapshot),
      { cause: error },
    );
  }
}

export function toolErrorFinding(options, { rule, path: findingPath = '.', message, anchor }) {
  return {
    tool: options.analyzerName,
    rule,
    path: findingPath,
    identity: rule,
    message: anchor === undefined ? message : withTroubleshooting(message, anchor),
    classification: 'tool-error',
  };
}

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
        ...assertionDetails(assertion, {
          testFile: absoluteFile(projectRoot, testResult?.name),
          projectRoot,
        }),
        name: assertionName(assertion),
        assertion:
          timeoutText(assertion) ??
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

function absoluteFile(projectRoot, name) {
  return typeof name === 'string' ? path.resolve(projectRoot, name) : undefined;
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

function failureEntry({ file, name, assertion }) {
  return `${file} > ${name}${assertion === '' ? '' : `: ${assertion}`}`;
}

export function formatTestFailures(
  report,
  projectRoot,
  { runnerName, precedingCommands, snapshot, mockPin = false } = {},
) {
  if (snapshot === 'base') {
    return testsFailOnBase(testFailures(report, projectRoot).map(failureEntry));
  }
  return [
    failureText(report, projectRoot, { runnerName, mockPin }),
    ...precedingNote(precedingCommands),
  ].join('\n');
}

function failureText(report, projectRoot, { runnerName, mockPin }) {
  const failures = testFailures(report, projectRoot);
  const failedCount = Number.isInteger(report?.numFailedTests)
    ? Math.max(report.numFailedTests, failures.length)
    : failures.length;
  const headline = mockPin
    ? mockPinHeadline(failedCount, runnerName)
    : testsFailHeadline(failedCount, 'coverage, CRAP and mutation were skipped');
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

function mockPinHeadline(count, runnerName) {
  const verb = count === 1 ? 'test fails' : 'tests fail';
  const setting = runnerName === RUNNER_NAMES.jest ? '`--restoreMocks`' : '`restoreMocks: true`';
  return [
    `${String(count)} ${verb} only because nitpicker pins ${setting} for the coverage run;`,
    'the same tests pass without it, so coverage, CRAP and mutation were skipped.',
    'Create the spy in `beforeEach` or inside the test instead of once in `beforeAll`',
    'or a `describe` body, and rerun:',
  ].join(' ');
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
