import { runNodeTool, parseReportJson } from './tooling.mjs';
import path from 'node:path';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import {
  COVERAGE_REPORT_PATH,
  coverageFailureFindings,
  readCoverageFindings,
  toolErrorFinding,
} from '../reporting/test-report.mjs';
import { readSlowTestFindings } from '../../slow-tests/slow-tests.mjs';
import { runProjectTests } from '../../test-runners/run-project-tests.mjs';
import { hasProjectTests, projectTestFiles } from '../../test-runners/test-run.mjs';
import { readLayout } from '../../../preset/head-policy.mjs';
import {
  TESTS_FAILED_RULE,
  TESTS_FAILED_SKIPPED_RULE,
} from '../../../../../shared/rules/finding-helpers.mjs';
import { normalizeCrap } from '../reporting/tests.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  testsFailAnchor,
} from '../../../../../shared/messages/troubleshooting.mjs';
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

export async function runCoverage(options) {
  const run = await runProjectTests(options);
  if (run.failed) {
    rmSync(path.join(options.projectRoot, COVERAGE_REPORT_PATH), { force: true });
    return coverageFailureFindings(options, run);
  }
  if (run.report.numTotalTests === 0) {
    rmSync(path.join(options.projectRoot, COVERAGE_REPORT_PATH), { force: true });
    return [noTestsRanFinding(options, run.runnerName)];
  }
  return [
    ...readCoverageFindings(options, run.report),
    ...(await readSlowTestFindings(options, run.report)),
  ];
}

function noTestsRanFinding(options, runnerName) {
  const layout = readLayout();
  const [first] = projectTestFiles(options, layout, layout.projectCodeFiles(options.projectRoot));
  return toolErrorFinding(options, {
    rule: TESTS_FAILED_RULE,
    path: first,
    message: `${runnerName} ran no tests, but nitpicker sees test files such as ${first}. Make the project's ${runnerName} config find them, or set "tools.tests.runner" in nitpicker.config.json to the runner they are written for.`,
    anchor: TROUBLESHOOTING_ANCHORS.noTestsRan,
  });
}

function hasRunnableTests(options) {
  const layout = readLayout();
  return hasProjectTests(options, layout, layout.projectCodeFiles(options.projectRoot));
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
        anchor: testsFailAnchor(options.snapshot),
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
