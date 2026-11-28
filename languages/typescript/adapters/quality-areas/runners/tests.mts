import type { Finding } from '../../static-checks/shared.mts';
import type { QualityAreaOptions, TextOutput } from '../typed/area-types.mts';
import { runNodeTool, parseReportJson } from '../typed/tooling.mts';
import path from 'node:path';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
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
import { projectTestRunner } from '../../test-runners/typed/runner-tools.mts';
import { RUNNER_NAMES } from '../../../preset/test-runner/runners.mts';
import { mockPinVerdict } from '../../test-runners/mock-pin-rerun.mts';
import { hasProjectTests, projectTestFiles } from '../../test-runners/test-run.mts';
import {
  TESTS_FAILED_SKIPPED_RULE,
  TESTS_NOT_RUN_RULE,
} from '../../../../../shared/rules/finding-parts.mts';
import { testsFailAnchor } from '../../../../../shared/messages/troubleshooting.mts';
import { preparedTestRun } from './prepared/prepared-results.mts';

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

async function preparedCoverage(
  options: QualityAreaOptions,
  directory: string,
): Promise<Finding[]> {
  const prepared = preparedTestRun(options, directory);
  if (prepared.findings !== undefined) {
    return prepared.findings;
  }
  if ((prepared.report.numTotalTests ?? 0) === 0) {
    await rm(path.join(options.projectRoot, COVERAGE_REPORT_PATH), { force: true });
    return [noTestsRanFinding(options, RUNNER_NAMES[projectTestRunner(options).runner])];
  }
  return [
    ...readCoverageFindings(options, prepared.report),
    ...(await readSlowTestFindings(options, prepared.report)),
  ];
}

export async function runCoverage(
  options: QualityAreaOptions,
  output: TextOutput,
): Promise<Finding[]> {
  const prepared = options.preparedTestResults;
  if (prepared !== undefined && prepared !== '') {
    return preparedCoverage(options, prepared);
  }
  const run = await runProjectTests(options);
  if (run.failed) {
    await rm(path.join(options.projectRoot, COVERAGE_REPORT_PATH), { force: true });
    const mockPin = await mockPinVerdict(options, run, output);
    return coverageFailureFindings(options, run, { mockPin });
  }
  if (run.report.numTotalTests === 0) {
    await rm(path.join(options.projectRoot, COVERAGE_REPORT_PATH), { force: true });
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

function crapSkipMessage(options: QualityAreaOptions): string {
  const prepared = options.preparedTestResults;
  return options.snapshot === 'base' && prepared !== undefined && prepared !== ''
    ? 'CRAP did not run: there is no coverage report, because the base tests were not run.'
    : 'CRAP did not run: there is no coverage report, because the project tests fail.';
}

export function runCrap(options: QualityAreaOptions): Finding[] {
  if (
    !existsSync(path.join(options.projectRoot, COVERAGE_REPORT_PATH)) &&
    hasRunnableTests(options)
  ) {
    return [
      toolErrorFinding(options, {
        rule: TESTS_FAILED_SKIPPED_RULE,
        message: crapSkipMessage(options),
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
