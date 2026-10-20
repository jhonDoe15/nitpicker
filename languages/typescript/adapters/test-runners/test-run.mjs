import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { trackTemporaryPath } from '../../../../core/tooling/temporary-files.mjs';
import { readLayout } from '../../preset/head-policy.mjs';
import { readHeadPolicyFile } from '../../../../shared/head-policy.mjs';
import {
  resolveTestTimeouts,
  TEST_TIMEOUT_CEILING_MS,
} from '../../../../shared/test-timeouts/resolve.mjs';
import { projectTestRunner } from '../../preset/test-runner/project-runner.mjs';
import {
  COVERAGE_REPORT_PATH,
  formatProcessOutput,
  readTestReport,
} from '../quality-areas/reporting/test-report.mjs';

export const TEST_TIMEOUT_MS = TEST_TIMEOUT_CEILING_MS;
const MAX_WORKERS = 4;

export function testTimeouts(file, policy = readHeadPolicyFile()) {
  return resolveTestTimeouts(policy, {
    file,
    language: policy.preset === 'javascript' ? 'javascript' : 'typescript',
  });
}

export function testTimeoutMs(options, files, { hooks = true } = {}) {
  if (options === undefined) {
    return testTimeouts().testTimeoutMs;
  }
  const selected = files ?? options.rerun?.files ?? runnableTestFiles(options);
  const limits = selected.map((file) =>
    testTimeouts(path.isAbsolute(file) ? path.relative(options.projectRoot, file) : file),
  );
  if (limits.length === 0) {
    limits.push(testTimeouts());
  }
  const timeout = limits[0].testTimeoutMs;
  if (!hooks && limits.some((limit) => limit.hookTimeoutMs !== undefined)) {
    throw new Error(
      'This test runner cannot set hook deadlines. Use Vitest for configured hook timeouts.',
    );
  }
  if (
    limits.some(
      (limit) =>
        limit.testTimeoutMs !== timeout ||
        (limit.hookTimeoutMs !== undefined && limit.hookTimeoutMs !== timeout),
    )
  ) {
    throw new Error(
      'This test runner uses one test and hook deadline. Use Vitest for projects with different timeout scopes.',
    );
  }
  return timeout;
}

export function workerCount(options) {
  return options.rerun === undefined ? MAX_WORKERS : 1;
}

export function uncoveredRun(command) {
  return {
    nodeArguments: [],
    environment: command.environment,
    write: () => Promise.resolve(),
    remove: () => {},
  };
}

export function coverageOutputFile(options) {
  return path.join(options.projectRoot, COVERAGE_REPORT_PATH);
}

export function temporaryProjectPath(options, name) {
  const filePath = path.resolve(options.projectRoot, `.nitpicker-diff-${name}`);
  if (!filePath.startsWith(`${options.projectRoot}${path.sep}`)) {
    throw new Error(`Temporary test file is outside the project: ${filePath}`);
  }
  if (existsSync(filePath)) {
    throw new Error(`Temporary test file already exists: ${filePath}`);
  }
  return trackTemporaryPath(filePath);
}

export function removeTemporary(...paths) {
  for (const filePath of paths) {
    rmSync(filePath, { force: true, recursive: true });
  }
}

function absoluteFiles(options, files) {
  return files.map((file) => path.join(options.projectRoot, file));
}

export function runnableTestFiles(options) {
  const layout = readLayout();
  return absoluteFiles(
    options,
    layout.projectCodeFiles(options.projectRoot).filter(layout.isRunnableTestFile),
  );
}

export function projectTestFiles(options, layout, files) {
  const isTest =
    projectTestRunner(options).runner === 'vitest' ? layout.isRunnableTestFile : layout.isTestFile;
  return files.filter(isTest);
}

export function hasProjectTests(options, layout, files) {
  return projectTestFiles(options, layout, files).length > 0;
}

export function coverageSourceFiles(options) {
  const layout = readLayout();
  return absoluteFiles(
    options,
    layout.projectCodeFiles(options.projectRoot, layout.sourceRoots).filter(layout.isSourceFile),
  );
}

export function coverageGlobs() {
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

function isFailing(report) {
  const results = Array.isArray(report?.testResults) ? report.testResults : [];
  return (
    (Number.isInteger(report?.numFailedTests) && report.numFailedTests > 0) ||
    results.some((result) => result?.status === 'failed')
  );
}

export function readRun({ reportPath, result, runnerName }) {
  return finishedRun({
    report: readTestReport(reportPath, result, runnerName),
    result,
    runnerName,
  });
}

export function finishedRun({ report, result, runnerName }) {
  const failing = isFailing(report);
  if (!failing && result.status !== 0) {
    throw new Error(
      `${runnerName} exited ${String(result.status)} although no test failed${formatProcessOutput(result)}`,
    );
  }
  return { failed: failing, report, result, runnerName };
}
