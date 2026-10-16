import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { trackTemporaryPath } from '../../../../core/tooling/temporary-files.mjs';
import { readLayout } from '../../preset/head-policy.mjs';
import { TEST_TIMEOUT_CEILING_MS } from '../../preset/eslint-plugin/rules/testing/assertions/no-raised-test-timeout.mjs';
import {
  COVERAGE_REPORT_PATH,
  formatProcessOutput,
  readTestReport,
} from '../quality-areas/reporting/test-report.mjs';

export const TEST_TIMEOUT_MS = TEST_TIMEOUT_CEILING_MS;
export const MAX_WORKERS = 4;

export function coverageOutputFile(options) {
  return path.join(options.projectRoot, COVERAGE_REPORT_PATH);
}

export function temporaryProjectPath(options, name) {
  const filePath = path.join(options.projectRoot, `.nitpicker-diff-${name}`);
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
  return finishedRun({ report: readTestReport(reportPath, result, runnerName), result, runnerName });
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
