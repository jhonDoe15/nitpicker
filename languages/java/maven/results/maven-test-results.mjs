import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { freshReports, suiteNameOf } from '../maven-tests.mjs';

const TEST_RESULTS_DIRECTORY = 'test-results';

function resultDirectories(module) {
  return [
    ['surefire', module.surefireReports],
    ['failsafe', module.failsafeReports],
  ];
}

export function copyTestResults({ module, reportDir, since, isArchunit }) {
  for (const [task, directory] of resultDirectories(module)) {
    const reports = freshReports(directory, since).filter(
      (report) => !isArchunit(suiteNameOf(report)),
    );
    if (reports.length > 0) {
      const target = path.join(reportDir, TEST_RESULTS_DIRECTORY, task);
      mkdirSync(target, { recursive: true });
      for (const report of reports) {
        copyFileSync(report, path.join(target, path.basename(report)));
      }
    }
  }
}
