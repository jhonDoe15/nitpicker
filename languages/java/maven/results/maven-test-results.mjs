import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { TEST_RESULTS_DIRECTORY } from '../../adapters/test-times/slow-tests.mjs';
import { freshReports, suiteNameOf } from '../maven-tests.mjs';

function copyReports(reports, target) {
  if (reports.length === 0) {
    return;
  }
  mkdirSync(target, { recursive: true });
  for (const report of reports) {
    copyFileSync(report, path.join(target, path.basename(report)));
  }
}

function resultDirectories(module) {
  const tasks = [['surefire', module.surefireReports]];
  const shared = path.resolve(module.failsafeReports) === path.resolve(module.surefireReports);
  return shared ? tasks : [...tasks, ['failsafe', module.failsafeReports]];
}

export function copyTestResults({ module, reportDir, since, isArchunit }) {
  for (const [task, directory] of resultDirectories(module)) {
    copyReports(
      freshReports(directory, since).filter((report) => !isArchunit(suiteNameOf(report))),
      path.join(reportDir, TEST_RESULTS_DIRECTORY, task),
    );
  }
}
