import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { TEST_CONSOLE_REPORT_PATH } from '../quality-areas/reporting/test-report.mjs';
import { temporaryProjectPath } from './test-run.mjs';
import { LINES_VARIABLE } from '../../preset/test-console/console-capture.mjs';
import {
  REPORT_VARIABLE,
  ROOT_VARIABLE,
  writeReportFile,
} from '../../preset/test-console/console-report.mjs';

const PRODUCER_FOLDER = 'languages/typescript/preset/test-console';

const CONSOLE_PRODUCERS = {
  vitest: `${PRODUCER_FOLDER}/vitest-reporter.config.mjs`,
  jest: `${PRODUCER_FOLDER}/runners/jest-reporter.config.mjs`,
  mocha: `${PRODUCER_FOLDER}/runners/mocha-hooks.config.mjs`,
  node: `${PRODUCER_FOLDER}/runners/node-test-preload.config.cjs`,
};

export function consoleProducerPath(options, runner) {
  return path.join(options.policyRoot, CONSOLE_PRODUCERS[runner]);
}

function entriesOf(linesPath) {
  return existsSync(linesPath)
    ? readFileSync(linesPath, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line))
    : [];
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
        writeReportFile(reportPath, entriesOf(linesPath));
      }
    },
    remove() {
      if (linesPath !== undefined) {
        rmSync(linesPath, { force: true });
      }
    },
  };
}
