import {
  REPORT_VARIABLE,
  ROOT_VARIABLE,
  consoleEntry,
  writeReportFile,
} from '../console-report.mjs';

const KINDS = new Set(['error', 'warn', 'assert']);

export function createJestReporter({ environment, directory }) {
  const root = environment[ROOT_VARIABLE] ?? directory;
  const entries = [];
  return {
    onTestResult(_test, testResult) {
      for (const { type, message } of testResult.console ?? []) {
        const entry = KINDS.has(type)
          ? consoleEntry({ content: message, root, file: testResult.testFilePath, test: '' })
          : undefined;
        if (entry !== undefined) {
          entries.push(entry);
        }
      }
    },
    onRunComplete() {
      const reportPath = environment[REPORT_VARIABLE];
      if (reportPath !== undefined && reportPath !== '') {
        writeReportFile(reportPath, entries);
      }
    },
  };
}
