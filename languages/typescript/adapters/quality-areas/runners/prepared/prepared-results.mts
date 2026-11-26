import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Finding } from '../../../static-checks/shared.mts';
import type { QualityAreaOptions } from '../../typed/area-types.mts';
import type { TestReport } from '../../../test-runners/typed/runner-types.mts';
import { COVERAGE_REPORT_PATH, toolErrorFinding } from '../../reporting/test-report.mts';
import {
  TESTS_BASE_NOT_RUN_RULE,
  TESTS_FAILED_RULE,
} from '../../../../../../shared/rules/finding-parts.mts';

export const TEST_RESULTS_VARIABLE = 'NITPICKER_TEST_RESULTS';

const COVERAGE_FILE = 'coverage-final.json';
const TEST_REPORT_FILE = 'test-report.json';

type Roots = { readonly from: string; readonly to: string };

export type PreparedRun =
  | { readonly findings: Finding[]; readonly report?: undefined }
  | { readonly findings?: undefined; readonly report: TestReport };

function rebasedPath(value: string, { from, to }: Roots): string {
  return value === from || value.startsWith(`${from}${path.sep}`)
    ? `${to}${value.slice(from.length)}`
    : value;
}

function isContainer(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function shellOf(value: unknown): Record<string, unknown> {
  return Array.isArray(value) ? Object.assign<unknown[], Record<string, unknown>>([], {}) : {};
}

function rebasedLeaf(value: unknown, roots: Roots): unknown {
  return typeof value === 'string' ? rebasedPath(value, roots) : value;
}

function rebased(value: unknown, roots: Roots): unknown {
  if (!isContainer(value)) {
    return rebasedLeaf(value, roots);
  }
  const result: Record<string, unknown> = shellOf(value);
  const pending: [unknown, Record<string, unknown>][] = [[value, result]];
  for (const [source, target] of pending) {
    if (!isContainer(source)) {
      continue;
    }
    for (const [key, item] of Object.entries(source)) {
      const copy = shellOf(item);
      target[Array.isArray(source) ? key : rebasedPath(key, roots)] = isContainer(item)
        ? copy
        : rebasedLeaf(item, roots);
      pending.push([item, copy]);
    }
  }
  return result;
}

function isTestReport(value: unknown): value is TestReport {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPrepared(options: QualityAreaOptions, directory: string, file: string): unknown {
  const base = path.resolve(options.liveProjectRoot, directory);
  const filePath = path.resolve(base, file);
  if (!filePath.startsWith(`${base}${path.sep}`)) {
    throw new Error(`${TEST_RESULTS_VARIABLE}: ${file} is outside ${directory}`);
  }
  const roots = { from: options.liveProjectRoot, to: options.projectRoot };
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    return rebased(parsed, roots);
  } catch (error) {
    throw new Error(`${TEST_RESULTS_VARIABLE}: ${file} cannot be read`, { cause: error });
  }
}

function failedCount(report: TestReport): number {
  return (
    (report.success === false ? 1 : 0) +
    (report.numFailedTests ?? 0) +
    (report.numFailedTestSuites ?? 0) +
    (report.numRuntimeErrorTestSuites ?? 0)
  );
}

export function preparedTestRun(options: QualityAreaOptions, directory: string): PreparedRun {
  if (options.snapshot === 'base') {
    return {
      findings: [
        toolErrorFinding(options, {
          rule: TESTS_BASE_NOT_RUN_RULE,
          anchor: undefined,
          message: `The base tests were not run: ${TEST_RESULTS_VARIABLE} hands in the test results of the head only.`,
        }),
      ],
    };
  }
  const report = readPrepared(options, directory, TEST_REPORT_FILE);
  if (!isTestReport(report)) {
    throw new TypeError(
      `${TEST_RESULTS_VARIABLE}: ${TEST_REPORT_FILE} is not a test report object`,
    );
  }
  if (failedCount(report) > 0) {
    return {
      findings: [
        toolErrorFinding(options, {
          rule: TESTS_FAILED_RULE,
          anchor: undefined,
          message: `The test results in ${TEST_RESULTS_VARIABLE} record failing tests. Fix them and record the results again.`,
        }),
      ],
    };
  }
  const target = path.join(options.projectRoot, COVERAGE_REPORT_PATH);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(readPrepared(options, directory, COVERAGE_FILE)));
  return { report };
}
