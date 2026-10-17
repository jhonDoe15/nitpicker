import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readHeadPolicyFile } from '../../../../shared/head-policy.mjs';
import { testConsoleFindings } from '../../../../shared/console/console-findings.mjs';

export const TEST_CONSOLE_TOOL = 'test-console';
const CONSOLE_REPORT = 'test-console.json';
const REPORT_VARIABLE = 'NITPICKER_CONSOLE_REPORT';
const REPORT_MISSING_RULE = 'console-report-missing';

export function consoleReportEnvironment({ project, reportRoot }) {
  return project.testRunner === 'pytest'
    ? { [REPORT_VARIABLE]: path.join(reportRoot, CONSOLE_REPORT) }
    : {};
}

function missingReportFinding() {
  return {
    tool: TEST_CONSOLE_TOOL,
    rule: REPORT_MISSING_RULE,
    path: '.',
    identity: REPORT_MISSING_RULE,
    message: `Test console output was not checked: the pytest run left no ${CONSOLE_REPORT}. A test that ends the process (os._exit) or a plugin that stops pytest early keeps nitpicker's console plugin from writing it.`,
    classification: 'tool-error',
  };
}

export function readConsoleReport(reportRoot, { testRunner, testsRan } = {}) {
  const file = path.join(reportRoot, CONSOLE_REPORT);
  if (existsSync(file)) {
    return { report: JSON.parse(readFileSync(file, 'utf8')), findings: [] };
  }
  const missing = testRunner === 'pytest' && testsRan === true;
  return { report: { entries: [] }, findings: missing ? [missingReportFinding()] : [] };
}

export function projectRelative(projectRoot, file) {
  const relative = path.relative(projectRoot, file).split(path.sep).join('/');
  return file === '' || relative.startsWith('..') ? '.' : relative;
}

export function consoleFacts(report, projectRoot) {
  return report.entries.map(({ file, test, messages }) => ({
    file: file === '' ? '' : projectRelative(projectRoot, file),
    test,
    messages,
  }));
}

export function consoleOutputFindings(report, { projectRoot, headPolicy = readHeadPolicyFile() }) {
  return testConsoleFindings(
    { entries: consoleFacts(report, projectRoot) },
    { analyzerName: TEST_CONSOLE_TOOL, allow: headPolicy.testConsole?.allow ?? [] },
  );
}

export function readConsoleFindings(reportRoot, { projectRoot, manifest }) {
  const { report, findings } = readConsoleReport(reportRoot, manifest);
  return [...findings, ...consoleOutputFindings(report, { projectRoot })];
}
