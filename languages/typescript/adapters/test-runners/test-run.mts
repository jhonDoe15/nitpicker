import { existsSync, rmSync } from 'node:fs';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';
import path from 'node:path';
import { trackTemporaryPath } from '../typed/tooling.mts';
import { type Layout, readLayout } from '../typed/head-policy.mts';
import { TEST_TIMEOUT_CEILING_MS } from '../../../../shared/test-timeouts/resolve.mjs';
import { projectTestRunner, readHeadPolicyFile, readTestReport } from './typed/runner-tools.mts';
import { isIntegrationTestFor, resolveTestTimeouts } from './typed/timeouts.mts';
import {
  COVERAGE_REPORT_PATH,
  formatProcessOutput,
} from '../quality-areas/reporting/test-report.mts';
import { troubleshootingError } from '../lint-engine/typed/tools.mts';
import { TROUBLESHOOTING_ANCHORS } from '../../../../shared/messages/troubleshooting.mjs';
import type { NodeToolResult } from '../static-checks/shared.mts';
import type {
  CoverageRun,
  RunnerCommand,
  TestOptions,
  TestReport,
  TestRun,
  TimeoutLimits,
} from './typed/runner-types.mts';

export const TEST_TIMEOUT_MS: number = TEST_TIMEOUT_CEILING_MS;
const MAX_WORKERS = 4;

export function testTimeouts(
  file?: string,
  policy = readHeadPolicyFile(),
  { floors }: { readonly floors: boolean } = { floors: true },
): TimeoutLimits {
  return resolveTestTimeouts(policy, {
    file,
    language: policy.preset === 'javascript' ? 'javascript' : 'typescript',
    integration: floors && isIntegrationTestFor(file, policy),
  });
}

export function testTimeoutMs(
  options: TestOptions | undefined,
  files?: readonly string[],
  { hooks }: { readonly hooks: boolean } = { hooks: true },
): number {
  if (options === undefined) {
    return testTimeouts().testTimeoutMs;
  }
  const selected = files ?? options.rerun?.files ?? runnableTestFiles(options);
  const relative = selected.map((file) =>
    path.isAbsolute(file) ? path.relative(options.projectRoot, file) : file,
  );
  const policy = readHeadPolicyFile();
  const limits = relative.map((file) => testTimeouts(file, policy, { floors: false }));
  const [first = testTimeouts(undefined, policy)] = limits;
  if (limits.length === 0) {
    limits.push(first);
  }
  const timeout = first.testTimeoutMs;
  if (!hooks && limits.some((limit) => limit.hookTimeoutMs !== undefined)) {
    throw troubleshootingError(
      'This test runner cannot set hook deadlines. Use Vitest for configured hook timeouts.',
      TROUBLESHOOTING_ANCHORS.testTimeoutsNeedVitest,
    );
  }
  if (
    limits.some(
      (limit) =>
        limit.testTimeoutMs !== timeout ||
        (limit.hookTimeoutMs !== undefined && limit.hookTimeoutMs !== timeout),
    )
  ) {
    throw troubleshootingError(
      'This test runner uses one test and hook deadline. Use Vitest for projects with different timeout scopes.',
      TROUBLESHOOTING_ANCHORS.testTimeoutsNeedVitest,
    );
  }
  return Math.max(
    ...relative.map((file) => {
      const { testTimeoutMs: test, hookTimeoutMs: hook } = testTimeouts(file, policy);
      return Math.max(test, hook ?? 0);
    }),
    timeout,
  );
}

export function workerCount(options: TestOptions): number {
  return options.rerun === undefined ? MAX_WORKERS : 1;
}

export function uncoveredRun(command: RunnerCommand): CoverageRun {
  return {
    nodeArguments: [],
    environment: command.environment,
    write: () => Promise.resolve(),
    remove: () => {},
  };
}

export function coverageOutputFile(options: TestOptions): string {
  return path.join(options.projectRoot, COVERAGE_REPORT_PATH);
}

export function temporaryProjectPath(options: TestOptions, name: string): string {
  const filePath = path.resolve(options.projectRoot, `.nitpicker-diff-${name}`);
  if (!filePath.startsWith(`${options.projectRoot}${path.sep}`)) {
    throw new Error(`Temporary test file is outside the project: ${filePath}`);
  }
  if (existsSync(filePath)) {
    throw new Error(`Temporary test file already exists: ${filePath}`);
  }
  return trackTemporaryPath(filePath);
}

export function removeTemporary(...paths: readonly string[]): void {
  for (const filePath of paths) {
    rmSync(filePath, { force: true, recursive: true });
  }
}

function absoluteFiles(options: TestOptions, files: readonly string[]): string[] {
  return files.map((file) => path.join(options.projectRoot, file));
}

export function runnableTestFiles(options: TestOptions): string[] {
  const layout = readLayout();
  return absoluteFiles(
    options,
    layout.projectCodeFiles(options.projectRoot).filter(layout.isRunnableTestFile),
  );
}

export function projectTestFiles(
  options: TestOptions,
  layout: Layout,
  files: readonly string[],
): string[] {
  const isTest =
    projectTestRunner(options).runner === 'vitest' ? layout.isRunnableTestFile : layout.isTestFile;
  return files.filter(isTest);
}

export function hasProjectTests(
  options: TestOptions,
  layout: Layout,
  files: readonly string[],
): boolean {
  return projectTestFiles(options, layout, files).length > 0;
}

export function coverageSourceFiles(options: TestOptions): string[] {
  const layout = readLayout();
  return absoluteFiles(
    options,
    layout.projectCodeFiles(options.projectRoot, layout.sourceRoots).filter(layout.isSourceFile),
  );
}

export function coverageGlobs(): {
  readonly include: readonly string[];
  readonly exclude: string[];
} {
  const layout = readLayout();
  return {
    include: layout.sourceGlobs,
    exclude: [
      ...layout.sourceTestDirectoryGlobs,
      ...layout.sourceRoots.map((root) => `${root}/**/*.{test,spec}.*`),
      '**/*.d.ts',
      ...layout.excludedGlobs,
    ],
  };
}

function isFailing(report: TestReport | undefined): boolean {
  const results = listOf(report?.testResults);
  return (
    (typeof report?.numFailedTests === 'number' &&
      Number.isInteger(report.numFailedTests) &&
      report.numFailedTests > 0) ||
    results.some((result) => fieldOf(result, 'status') === 'failed')
  );
}

export function readRun({
  reportPath,
  result,
  runnerName,
  snapshot,
}: {
  readonly reportPath: string;
  readonly result: NodeToolResult;
  readonly runnerName: string;
  readonly snapshot: string;
}): TestRun {
  return finishedRun({
    report: readTestReport(reportPath, result, { runnerName, snapshot }),
    result,
    runnerName,
  });
}

export function finishedRun({
  report,
  result,
  runnerName,
}: {
  readonly report: TestReport;
  readonly result: NodeToolResult;
  readonly runnerName: string;
}): TestRun {
  const failing = isFailing(report);
  if (!failing && result.status !== 0) {
    throw new Error(
      `${runnerName} exited ${String(result.status)} although no test failed${formatProcessOutput(result)}`,
    );
  }
  return { failed: failing, report, result, runnerName };
}
