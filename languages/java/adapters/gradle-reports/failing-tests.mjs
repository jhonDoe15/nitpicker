import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { failedCases, failingTestsError, freshReports } from '../../builds/test-failures.mjs';

const TEST_RESULTS_FILE = 'test-results.json';

export function failingTestsOf(projectRoot, { reportBase, since, snapshot }) {
  const file = path.join(reportBase, TEST_RESULTS_FILE);
  if (!existsSync(file)) {
    return undefined;
  }
  const failures = JSON.parse(readFileSync(file, 'utf8'))
    .flatMap((directory) => freshReports(directory, since))
    .sort()
    .flatMap(failedCases);
  return failures.length === 0 ? undefined : failingTestsError(projectRoot, failures, snapshot);
}
