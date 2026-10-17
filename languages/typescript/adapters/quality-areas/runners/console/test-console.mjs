import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { readHeadPolicy } from '../../../../preset/head-policy.mjs';
import { testConsoleFindings } from '../../../../../../shared/console/console-findings.mjs';
import { TEST_CONSOLE_REPORT_PATH, toolErrorFinding } from '../../reporting/vitest.mjs';
import { parseReportJson, relativeProjectPath } from '../tooling.mjs';

export function runTestConsole(options) {
  const reportPath = path.join(options.projectRoot, TEST_CONSOLE_REPORT_PATH);
  if (!existsSync(reportPath)) {
    return [
      toolErrorFinding(options, {
        rule: 'test-console-report-missing',
        message: `Test console output was not checked: the coverage run left no ${TEST_CONSOLE_REPORT_PATH}.`,
      }),
    ];
  }
  const { testConsole, exceptions } = readHeadPolicy();
  const projectRoot = realpathSync(options.projectRoot);
  const report = parseReportJson(readFileSync(reportPath, 'utf8'));
  const entries = report.entries.map((entry) => ({
    ...entry,
    file: entry.file === '' ? '' : relativeProjectPath(projectRoot, entry.file),
  }));
  return testConsoleFindings(
    { entries },
    { analyzerName: options.analyzerName, allow: testConsole.allow, exceptions },
  );
}
