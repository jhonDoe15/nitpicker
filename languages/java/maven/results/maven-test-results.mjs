import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { TEST_RESULTS_DIRECTORY } from '../../adapters/test-times/slow-tests.mjs';
import { freshReports, suiteNameOf, testReportDirectories } from '../maven-tests.mjs';

const REDIRECTED_OUTPUT = /^(.+)-output\.txt$/u;

function copyReports(reports, target) {
  if (reports.length === 0) {
    return;
  }
  mkdirSync(target, { recursive: true });
  for (const report of reports) {
    copyFileSync(report, path.join(target, path.basename(report)));
  }
}

function freshOutputs(directory, since, isArchunit) {
  return existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => REDIRECTED_OUTPUT.test(name))
        .filter((name) => !isArchunit(REDIRECTED_OUTPUT.exec(name)[1]))
        .map((name) => path.join(directory, name))
        .filter((file) => statSync(file).mtimeMs >= since)
    : [];
}

export function copyTestResults({ module, reportDir, since, isArchunit }) {
  for (const [task, directory] of testReportDirectories(module)) {
    copyReports(
      [
        ...freshReports(directory, since).filter((report) => !isArchunit(suiteNameOf(report))),
        ...freshOutputs(directory, since, isArchunit),
      ],
      path.join(reportDir, TEST_RESULTS_DIRECTORY, task),
    );
  }
}
