import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { Finding } from '../../../static-checks/shared.mts';
import type { QualityAreaOptions } from '../../typed/area-types.mts';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../../../../shared/values/readers.mts';
import { readHeadPolicy, testConsoleFindings } from '../../typed/policy.mts';
import { TEST_CONSOLE_REPORT_PATH } from '../../reporting/test-report.mjs';
import { toolErrorFinding } from '../../typed/reporting.mts';
import { parseReportJson, relativeProjectPath } from '../../typed/tooling.mts';

export function runTestConsole(options: QualityAreaOptions): Finding[] {
  const reportPath = path.join(options.projectRoot, TEST_CONSOLE_REPORT_PATH);
  if (!existsSync(reportPath)) {
    return [
      toolErrorFinding(options, {
        rule: 'test-console-report-missing',
        anchor: undefined,
        message: `Test console output was not checked: the coverage run left no ${TEST_CONSOLE_REPORT_PATH}.`,
      }),
    ];
  }
  const { testConsole, exceptions } = readHeadPolicy();
  const projectRoot = realpathSync(options.projectRoot);
  const report = parseReportJson(readFileSync(reportPath, 'utf8'));
  const entries = listOf(fieldOf(report, 'entries')).map((entry) => ({
    ...fieldsOf(entry),
    file:
      fieldOf(entry, 'file') === ''
        ? ''
        : relativeProjectPath(projectRoot, textOf(fieldOf(entry, 'file'))),
  }));
  return testConsoleFindings(
    { entries },
    { analyzerName: options.analyzerName, allow: testConsole.allow, exceptions },
  );
}
