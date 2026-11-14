import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { failedCaseEntries, freshReports, moduleName } from '../../builds/test-failures.mjs';
import { fieldOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

type FailingTests = {
  readonly module: string;
  readonly tests: readonly string[];
  readonly details: readonly unknown[];
};
type ResultsRequest = {
  readonly reportBase: string;
  readonly since: number;
  readonly retriesPass?: boolean;
};

const TEST_RESULTS_FILE = 'test-results.json';

function failingModule(entry: unknown, since: number, retriesPass: boolean): FailingTests {
  const entries = textsOf(fieldOf(entry, 'results'))
    .flatMap((directory) => textsOf(freshReports(directory, since)))
    .sort()
    .flatMap((report) => listOf(failedCaseEntries(report, { retriesPass })));
  return {
    module: textOf(moduleName(fieldOf(entry, 'dir'))),
    tests: entries.map((failure) => textOf(fieldOf(failure, 'text'))),
    details: entries.map((failure) => fieldOf(failure, 'detail')),
  };
}

export function failingTestsOf({
  reportBase,
  since,
  retriesPass = false,
}: ResultsRequest): FailingTests[] {
  const file = path.join(reportBase, TEST_RESULTS_FILE);
  if (!existsSync(file)) {
    return [];
  }
  const modules: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return listOf(modules)
    .map((entry) => failingModule(entry, since, retriesPass))
    .filter(({ tests }) => tests.length > 0);
}
