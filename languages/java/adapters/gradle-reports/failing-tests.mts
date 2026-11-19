import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  failedCaseEntries,
  freshReports,
  moduleName,
  type TestFailure,
} from '../../builds/test-failures.mts';
import { fieldOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

type ResultsRequest = {
  readonly reportBase: string;
  readonly since: number;
  readonly retriesPass: boolean;
};

const TEST_RESULTS_FILE = 'test-results.json';

function failingModule(entry: unknown, since: number, retriesPass: boolean): TestFailure {
  const entries = textsOf(fieldOf(entry, 'results'))
    .flatMap((directory) => freshReports(directory, since))
    .sort()
    .flatMap((report) => failedCaseEntries(report, { retriesPass }));
  return {
    module: moduleName(textOf(fieldOf(entry, 'dir'))),
    tests: entries.map(({ text }) => text),
    details: entries.map(({ detail }) => detail),
  };
}

export function failingTestsOf({ reportBase, since, retriesPass }: ResultsRequest): TestFailure[] {
  const file = path.join(reportBase, TEST_RESULTS_FILE);
  if (!existsSync(file)) {
    return [];
  }
  const modules: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return listOf(modules)
    .map((entry) => failingModule(entry, since, retriesPass))
    .filter(({ tests }) => tests.length > 0);
}
