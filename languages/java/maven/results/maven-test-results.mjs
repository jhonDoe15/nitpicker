import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TEST_RESULTS_DIRECTORY } from '../../adapters/test-times/slow-tests.mjs';
import { freshReports, suiteNameOf, testReportDirectories } from '../maven-tests.mjs';
import { splitReport } from './report-split.mjs';

function copyReports(reports, target, isArchunit) {
  const copies = reports
    .map((report) => ({
      name: path.basename(report),
      text: splitReport(readFileSync(report, 'utf8'), isArchunit, suiteNameOf(report)).other,
    }))
    .filter(({ text }) => text !== undefined);
  if (copies.length === 0) {
    return;
  }
  mkdirSync(target, { recursive: true });
  for (const { name, text } of copies) {
    writeFileSync(path.join(target, name), text);
  }
}

export function copyTestResults({ module, reportDir, since, isArchunit }) {
  for (const [task, directory] of testReportDirectories(module)) {
    copyReports(
      freshReports(directory, since),
      path.join(reportDir, TEST_RESULTS_DIRECTORY, task),
      isArchunit,
    );
  }
}
