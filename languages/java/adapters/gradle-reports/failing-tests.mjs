import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { failedCaseEntries, freshReports, moduleName } from '../../builds/test-failures.mjs';

const TEST_RESULTS_FILE = 'test-results.json';

export function failingTestsOf({ reportBase, since }) {
  const file = path.join(reportBase, TEST_RESULTS_FILE);
  if (!existsSync(file)) {
    return [];
  }
  return JSON.parse(readFileSync(file, 'utf8'))
    .map(({ dir, results }) => {
      const entries = results
        .flatMap((directory) => freshReports(directory, since))
        .sort()
        .flatMap(failedCaseEntries);
      return {
        module: moduleName(dir),
        tests: entries.map(({ text }) => text),
        details: entries.map(({ detail }) => detail),
      };
    })
    .filter(({ tests }) => tests.length > 0);
}
