import type { Finding } from '../../static-checks/shared.mts';
import type { QualityAreaOptions } from '../typed/area-types.mts';
import { runNodeTool, parseReportJson } from '../typed/tooling.mts';
import path from 'node:path';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import {
  COVERAGE_REPORT_PATH,
  coverageFailureFindings,
  readCoverageFindings,
  toolErrorFinding,
} from '../reporting/test-report.mts';
import { normalizeCrap } from '../reporting/tests.mts';
import { withFunctionSourceHashes } from '../reporting/source-hashes.mts';
import { readLayout } from '../../typed/head-policy.mts';
import { readSlowTestFindings } from '../../slow-tests/slow-tests.mts';
import { runProjectTests } from '../../test-runners/run-project-tests.mts';
import { hasProjectTests, projectTestFiles } from '../../test-runners/test-run.mts';
import {
  TESTS_FAILED_SKIPPED_RULE,
  TESTS_NOT_RUN_RULE,
} from '../../../../../shared/rules/finding-helpers.mjs';
import { testsFailAnchor } from '../../../../../shared/messages/troubleshooting.mjs';

export function runPolicyTests(options: QualityAreaOptions): Finding[] {
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

export async function runCoverage(options: QualityAreaOptions): Promise<Finding[]> {
  const run = await runProjectTests(options);
  if (run.failed) {
    rmSync(path.join(options.projectRoot, COVERAGE_REPORT_PATH), { force: true });
    return coverageFailureFindings(options, run);
  }
  if (run.report.numTotalTests === 0) {
    rmSync(path.join(options.projectRoot, COVERAGE_REPORT_PATH), { force: true });
    return [noTestsRanFinding(options, run.runnerName)];
  }
  keepCoverageReport(options);
  return [
    ...readCoverageFindings(options, run.report),
    ...(await readSlowTestFindings(options, run.report)),
  ];
}

function keepCoverageReport(options: QualityAreaOptions): void {
  const directory = options.keepCoverageReport;
  const source = path.join(options.projectRoot, COVERAGE_REPORT_PATH);
  if (directory === undefined || directory === '' || !existsSync(source)) {
    return;
  }
  const target = path.resolve(directory, `${options.snapshot}-coverage-final.json`);
  if (path.relative(directory, target).startsWith('..')) {
    return;
  }
  mkdirSync(directory, { recursive: true });
  copyFileSync(source, target);
}

function noTestsRanFinding(options: QualityAreaOptions, runnerName: string): Finding {
  const layout = readLayout();
  const [first] = projectTestFiles(options, layout, layout.projectCodeFiles(options.projectRoot));
  return toolErrorFinding(options, {
    rule: TESTS_NOT_RUN_RULE,
    path: first,
    anchor: undefined,
    message: `${runnerName} ran no tests, but nitpicker sees test files such as ${String(first)}. Make the project's ${runnerName} config find them, or set "tools.tests.runner" in nitpicker.config.json to the runner they are written for.`,
  });
}

function hasRunnableTests(options: QualityAreaOptions): boolean {
  const layout = readLayout();
  return hasProjectTests(options, layout, layout.projectCodeFiles(options.projectRoot));
}

export function runCrap(options: QualityAreaOptions): Finding[] {
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
