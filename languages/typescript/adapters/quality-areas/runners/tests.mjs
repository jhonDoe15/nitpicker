import { runNodeTool, parseReportJson } from './tooling.mjs';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  coverageFailureFindings,
  readCoverageFindings,
  toolErrorFinding,
} from '../reporting/test-results.mjs';
import { testRunnerFor } from '../../../preset/test-runner/current.mjs';
import { COVERAGE_REPORT_PATH } from '../../test-runners/coverage-globs.mjs';
import { runTestsWithCoverage } from '../../test-runners/run-tests.mjs';
import { readLayout } from '../../../preset/head-policy.mjs';
import { TESTS_FAILED_SKIPPED_RULE } from '../../../../../shared/rules/finding-helpers.mjs';
import { normalizeCrap } from '../reporting/tests.mjs';
import { withFunctionSourceHashes } from '../reporting/source-hashes.mjs';

export function runPolicyTests(options) {
  if (options.snapshot === 'base') {
    return [];
  }
  runNodeTool({
    options,
    relativeToolPath: 'vitest/vitest.mjs',
    arguments_: ['run', '--config', path.join(options.policyRoot, 'vitest.config.mts')],
    cwd: options.policyRoot,
    acceptedStatuses: [0],
  });
  return [];
}

export function runCoverage(options) {
  const runner = testRunnerFor(options.projectRoot);
  const { result, report } = runTestsWithCoverage(options, runner);
  if (result.status !== 0) {
    return coverageFailureFindings({ ...options, testRunner: runner }, report, result);
  }
  return readCoverageFindings(options, report);
}

function hasRunnableTests(options) {
  const layout = readLayout();
  return layout.projectCodeFiles(options.projectRoot).some(layout.isRunnableTestFile);
}

export function runCrap(options) {
  if (
    !existsSync(path.join(options.projectRoot, COVERAGE_REPORT_PATH)) &&
    hasRunnableTests(options)
  ) {
    return [
      toolErrorFinding(options, {
        rule: TESTS_FAILED_SKIPPED_RULE,
        message: 'CRAP did not run: there is no coverage report, because the project tests fail.',
      }),
    ];
  }
  runNodeTool({
    options,
    absoluteToolPath: path.join(options.policyRoot, 'languages/typescript/preset/crap/report.mjs'),
    arguments_: [],
    cwd: options.projectRoot,
    environment: { NITPICKER_PROJECT_ROOT: options.projectRoot },
    acceptedStatuses: [0],
  });
  const report = parseReportJson(
    readFileSync(path.join(options.projectRoot, 'reports/quality/crap/report.json'), 'utf8'),
  );
  return normalizeCrap(
    withFunctionSourceHashes(report, options.projectRoot),
    options.analyzerName,
    {
      scoreLimit: options.crapScoreLimit,
    },
  );
}
