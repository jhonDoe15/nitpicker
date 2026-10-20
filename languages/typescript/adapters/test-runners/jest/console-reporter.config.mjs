import {
  REPORT_VARIABLE,
  consoleEntry,
  writeConsoleReport,
} from '../../../preset/test-console/console-report.mjs';

export default function consoleReporter(globalConfig) {
  const entries = [];
  return {
    onTestResult(test, result) {
      for (const log of result.console ?? []) {
        if (log.type === 'warn' || log.type === 'error') {
          entries.push(consoleEntry(test.path, '', log.message, globalConfig.rootDir));
        }
      }
    },
    onRunComplete() {
      writeConsoleReport(process.env[REPORT_VARIABLE], entries);
    },
  };
}
