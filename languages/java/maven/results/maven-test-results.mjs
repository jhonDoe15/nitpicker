import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { TEST_RESULTS_DIRECTORY } from '../../adapters/test-times/slow-tests.mjs';
import { freshReports, suiteNameOf, testReportDirectories } from '../maven-tests.mjs';

function copyReports(reports, target) {
  if (reports.length === 0) {
    return;
  }
  mkdirSync(target, { recursive: true });
  for (const report of reports) {
    copyFileSync(report, path.join(target, path.basename(report)));
  }
}

export function copyTestResults({ module, reportDir, since, isArchunit }) {
  for (const [task, directory] of testReportDirectories(module)) {
    copyReports(
      freshReports(directory, since).filter((report) => !isArchunit(suiteNameOf(report))),
      path.join(reportDir, TEST_RESULTS_DIRECTORY, task),
    );
  }
}
