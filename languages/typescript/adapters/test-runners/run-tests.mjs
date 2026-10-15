import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { trackTemporaryPath } from '../../../../core/tooling/temporary-files.mjs';
import { testRunnerLabel } from '../../preset/test-runner/runners.mjs';
import { runJestWithCoverage } from './runners/jest.mjs';
import { runNodeTestWithCoverage } from './runners/node-test.mjs';
import { formatProcessOutput } from './tool-process.mjs';
import { runVitestWithCoverage } from './runners/vitest.mjs';

const EXECUTORS = new Map([
  ['vitest', runVitestWithCoverage],
  ['jest', runJestWithCoverage],
  ['node-test', runNodeTestWithCoverage],
]);

function readTestReport(runner, reportPath, result) {
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `${testRunnerLabel(runner)} exited ${String(result.status)} without a readable test report: ${error instanceof Error ? error.message : String(error)}${formatProcessOutput(result)}`,
      { cause: error },
    );
  }
}

export function runTestsWithCoverage(options, runner) {
  const reportPath = path.join(options.projectRoot, `.nitpicker-diff-${runner}-report.json`);
  if (existsSync(reportPath)) {
    throw new Error(`Temporary coverage report already exists: ${reportPath}`);
  }
  const temporary = [];
  const register = (filePath) => {
    trackTemporaryPath(filePath);
    temporary.push(filePath);
    return filePath;
  };
  register(reportPath);
  try {
    const result = EXECUTORS.get(runner)({ options, reportPath, register });
    return { result, report: readTestReport(runner, reportPath, result) };
  } finally {
    for (const filePath of temporary) {
      rmSync(filePath, { recursive: true, force: true });
    }
  }
}
