import { TESTS_FAILED_RULE } from '../../../../../shared/rules/finding-helpers.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { testRunnerLabel } from '../../../preset/test-runner/runners.mjs';
import { COVERAGE_REPORT_PATH } from '../../test-runners/coverage-globs.mjs';
import {
  findingPath,
  formatProcessOutput,
  formatTestFailures,
  testFailures,
} from '../../test-runners/test-report.mjs';
import { normalizeCoverage } from './tests.mjs';
import { withBranchSourceHashes } from './source-hashes.mjs';

export function coverageFailureFindings(options, report, result) {
  const [firstFailure] = testFailures(report, options.projectRoot);
  if (firstFailure === undefined) {
    throw new Error(
      `${testRunnerLabel(options.testRunner ?? 'vitest')} exited ${String(result.status)} without naming a failing test${formatProcessOutput(result)}`,
    );
  }
  return [
    toolErrorFinding(options, {
      rule: TESTS_FAILED_RULE,
      path: findingPath(firstFailure.file),
      message: formatTestFailures(report, options.projectRoot),
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
