import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { freshReports, suiteNameOf } from '../maven-tests.mjs';

const TEST_RESULTS_DIRECTORY = 'test-results';

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
  const tasks = [
    ['surefire', module.surefireReports],
    ['failsafe', module.failsafeReports],
  ];
  for (const [task, directory] of tasks) {
    copyReports(
      freshReports(directory, since).filter((report) => !isArchunit(suiteNameOf(report))),
      path.join(reportDir, TEST_RESULTS_DIRECTORY, task),
    );
  }
}
