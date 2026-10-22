import {
  REPORT_VARIABLE,
  ROOT_VARIABLE,
  consoleEntry,
  writeReportFile,
} from '../console-report.mjs';

const KINDS = new Set(['error', 'warn', 'assert']);

const JEST_ASSERTION = /^(\s*)AssertionError(?: \[ERR_ASSERTION\])?: /u;

const NO_ASSERTION_MESSAGE = 'The expression evaluated to a falsy value';

function nodeAssertText(message) {
  const match = JEST_ASSERTION.exec(message);
  if (match === null) {
    return message;
  }
  const text = message.slice(match[0].length);
  return text === NO_ASSERTION_MESSAGE
    ? `${match[1]}Assertion failed`
    : `${match[1]}Assertion failed: ${text}`;
}

export function createJestReporter({ environment, directory }) {
  const root = environment[ROOT_VARIABLE] ?? directory;
  const entries = [];
  return {
    onTestResult(_test, testResult) {
      for (const { type, message } of testResult.console ?? []) {
        const entry = KINDS.has(type)
          ? consoleEntry({
              content: type === 'assert' ? nodeAssertText(message) : message,
              root,
              file: testResult.testFilePath,
              test: '',
            })
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
