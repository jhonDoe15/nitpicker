import { rmSync } from 'node:fs';
import path from 'node:path';
import { TEST_CONSOLE_REPORT_PATH } from '../quality-areas/reporting/test-report.mjs';
import { REPORT_VARIABLE } from '../../preset/test-console/console-report.mjs';

export function consoleReportEnvironment(options) {
  const reportPath = path.join(options.projectRoot, TEST_CONSOLE_REPORT_PATH);
  rmSync(reportPath, { force: true });
  return { [REPORT_VARIABLE]: reportPath };
}
