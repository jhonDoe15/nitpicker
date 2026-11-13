import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEST_CONSOLE_REPORT_PATH } from '../quality-areas/reporting/test-report.mjs';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { temporaryProjectPath } from './test-run.mts';
import { consoleEntry, writeReportFile } from './typed/runner-tools.mts';
import type { TestConsole, TestOptions } from './typed/runner-types.mts';
import {
  LINES_VARIABLE,
  REPORT_VARIABLE,
  ROOT_VARIABLE,
  RUNNER_VARIABLE,
} from '../../preset/test-console/console-report.mjs';

type RecordedCall = { readonly content: string; readonly [field: string]: unknown };

const PRODUCER_FOLDER = 'languages/typescript/preset/test-console';

const CONSOLE_PRODUCERS = {
  vitest: `${PRODUCER_FOLDER}/vitest-reporter.config.mjs`,
  jest: `${PRODUCER_FOLDER}/runners/jest-reporter.config.mjs`,
  mocha: `${PRODUCER_FOLDER}/runners/mocha-capture.config.mjs`,
};

const JEST_ASSERT = 'languages/typescript/adapters/test-runners/jest/jest-assert.mjs';

export function consoleProducerPath(
  options: TestOptions,
  runner: keyof typeof CONSOLE_PRODUCERS,
): string {
  return path.join(options.policyRoot, CONSOLE_PRODUCERS[runner]);
}

export function jestAssertImport(options: TestOptions): string {
  const assertUrl = checkoutModuleUrl(
    pathToFileURL(path.join(options.policyRoot, JEST_ASSERT)),
  ).href;
  const source = `import { watchJestConsole } from ${JSON.stringify(assertUrl)};\nwatchJestConsole();`;
  return `--import=data:text/javascript,${encodeURIComponent(source)}`;
}

function parsedLine(line: string): { readonly value?: unknown; readonly malformed?: unknown } {
  try {
    return { value: JSON.parse(line) };
  } catch (error) {
    return { malformed: error };
  }
}

function isRecordedCall(value: unknown): value is RecordedCall {
  return typeof fieldOf(value, 'content') === 'string';
}

function recordedCall(line: string): RecordedCall | undefined {
  const { value } = parsedLine(line);
  return isRecordedCall(value) ? value : undefined;
}

function entriesOf(linesPath: string, root: string): unknown[] {
  const lines = existsSync(linesPath) ? readFileSync(linesPath, 'utf8').split('\n') : [];
  return lines
    .map((line) => recordedCall(line))
    .filter((line) => line !== undefined)
    .map((line) => consoleEntry({ ...line, root }))
    .filter((entry) => entry !== undefined);
}

export function startTestConsole(
  options: TestOptions,
  { collectsLines }: { readonly collectsLines: boolean },
): TestConsole {
  if (options.rerun !== undefined) {
    return { enabled: false, environment: {}, finish() {}, remove() {} };
  }
  const reportPath = path.join(options.projectRoot, TEST_CONSOLE_REPORT_PATH);
  rmSync(reportPath, { force: true });
  const linesPath = collectsLines ? temporaryProjectPath(options, 'test-console.jsonl') : undefined;
  return {
    enabled: true,
    environment: {
      [REPORT_VARIABLE]: reportPath,
      [ROOT_VARIABLE]: options.projectRoot,
      ...(linesPath === undefined ? {} : { [LINES_VARIABLE]: linesPath, [RUNNER_VARIABLE]: '' }),
    },
    finish() {
      if (linesPath !== undefined) {
        writeReportFile(reportPath, entriesOf(linesPath, options.projectRoot));
      }
    },
    remove() {
      if (linesPath !== undefined) {
        rmSync(linesPath, { force: true });
      }
    },
  };
}
