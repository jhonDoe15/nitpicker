import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { TEST_CONSOLE_REPORT_PATH } from '../quality-areas/reporting/test-report.mjs';
import { temporaryProjectPath } from './test-run.mjs';
import {
  LINES_VARIABLE,
  REPORT_VARIABLE,
  ROOT_VARIABLE,
  consoleEntry,
  writeReportFile,
} from '../../preset/test-console/console-report.mjs';

const PRODUCER_FOLDER = 'languages/typescript/preset/test-console';

const CONSOLE_PRODUCERS = {
  vitest: `${PRODUCER_FOLDER}/vitest-reporter.config.mjs`,
  jest: `${PRODUCER_FOLDER}/runners/jest-reporter.config.mjs`,
  mocha: `${PRODUCER_FOLDER}/runners/mocha-capture.config.mjs`,
};

export function consoleProducerPath(options, runner) {
  return path.join(options.policyRoot, CONSOLE_PRODUCERS[runner]);
}

function parsedLine(line) {
  try {
    return { value: JSON.parse(line) };
  } catch (error) {
    return { malformed: error };
  }
}

function recordedCall(line) {
  const { value } = parsedLine(line);
  return typeof value?.content === 'string' ? value : undefined;
}

function entriesOf(linesPath, root) {
  const lines = existsSync(linesPath) ? readFileSync(linesPath, 'utf8').split('\n') : [];
  return lines
    .map((line) => recordedCall(line))
    .filter((line) => line !== undefined)
    .map((line) => consoleEntry({ ...line, root }))
    .filter((entry) => entry !== undefined);
}

export function startTestConsole(options, { collectsLines }) {
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
      ...(linesPath === undefined ? {} : { [LINES_VARIABLE]: linesPath }),
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
