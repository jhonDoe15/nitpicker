import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { JavaFinding } from '../../adapters/typed/java-values.mts';

const UNMUTATED_FILE = 'unmutated-failures.txt';
const SKIPPED_FILE = 'skipped-tests.txt';
const SKIPPED_RULE = 'pit-skipped-tests';
const LISTED_TESTS = 5;
const NOT_PASSING = /testClass=([^,\s]+), name=(.+?)\]? did not pass without mutation/u;
const JUNIT_METHOD = /\[method:([^\]]+)\]/u;

type PitPart = { readonly part: string; readonly file: string };
type UnmutatedTest = { readonly testClass: string; readonly label: string };
type SkippedPlace = { readonly moduleDir: string; readonly part: string };

export function pitPartFiles(pitRoot: string, name: string): PitPart[] {
  const parts = existsSync(pitRoot)
    ? readdirSync(pitRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .toSorted()
    : [];
  return ['', ...parts]
    .map((part) => ({ part, file: path.join(pitRoot, part, name) }))
    .filter(({ file }) => existsSync(file));
}

function unmutatedFailureLines(output: unknown): string[] {
  return String(output)
    .split(/\r?\n/u)
    .filter((line) => NOT_PASSING.test(line));
}

export function writeUnmutatedFailures(pitDir: string, output: unknown): boolean {
  const lines = unmutatedFailureLines(output);
  if (lines.length > 0) {
    writeFileSync(path.join(pitDir, UNMUTATED_FILE), `${lines.join('\n')}\n`);
  }
  return lines.length > 0;
}

function simpleName(testClass: string): string {
  return testClass.split('.').at(-1) ?? testClass;
}

export function unmutatedFailures(output: unknown): UnmutatedTest[] {
  const tests = unmutatedFailureLines(output).map((line) => {
    const [, testClass = '', name = ''] = NOT_PASSING.exec(line) ?? [];
    const method = JUNIT_METHOD.exec(name)?.[1];
    return { testClass, label: `${simpleName(testClass)}.${method ?? name}` };
  });
  return [...new Map(tests.map((test) => [test.label, test])).values()];
}

export function unmutatedSummary(tests: readonly UnmutatedTest[]): string {
  const classes = new Set(tests.map(({ testClass }) => simpleName(testClass)));
  const where = classes.size === 1 ? `in ${[...classes][0]}` : `in ${classes.size} test classes`;
  const [noun, verb] = tests.length === 1 ? ['test', 'it passes'] : ['tests', 'they pass'];
  return (
    `${tests.length} ${noun} ${where} did not pass without mutation under PIT; ` +
    `${verb} under the build's test task`
  );
}

export function leadWithUnmutatedSummary(pitRoot: string, part: string, message: string): string {
  const entry = pitPartFiles(pitRoot, UNMUTATED_FILE).find((found) => found.part === part);
  const tests = entry === undefined ? [] : unmutatedFailures(readFileSync(entry.file, 'utf8'));
  return tests.length === 0 ? message : `${unmutatedSummary(tests)}. ${message}`;
}

export function writeSkippedTests(pitDir: string): void {
  const source = path.join(pitDir, UNMUTATED_FILE);
  if (existsSync(source)) {
    writeFileSync(path.join(pitDir, SKIPPED_FILE), readFileSync(source, 'utf8'));
  }
}

function skippedNotice(
  tests: readonly UnmutatedTest[],
  { moduleDir, part }: SkippedPlace,
): JavaFinding {
  const shown = tests.slice(0, LISTED_TESTS).map(({ label }) => label);
  const rest = tests.length - shown.length;
  const named = rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(', ');
  return {
    tool: 'pit',
    rule: SKIPPED_RULE,
    path: '.',
    identity: [SKIPPED_RULE, moduleDir || '.', part].filter(Boolean).join(':'),
    symbol: moduleDir || '.',
    message:
      `${unmutatedSummary(tests)}. PIT ran again without them (${named}), so the mutation ` +
      'findings come from the remaining tests, and mutants only the skipped tests would kill ' +
      'may count as surviving',
    classification: 'descriptive',
  };
}

export function pitSkippedFindings(reportRoot: string, moduleDir = ''): JavaFinding[] {
  return pitPartFiles(path.join(reportRoot, 'pit'), SKIPPED_FILE)
    .map(({ part, file }) => ({ part, tests: unmutatedFailures(readFileSync(file, 'utf8')) }))
    .filter(({ tests }) => tests.length > 0)
    .map(({ part, tests }) => skippedNotice(tests, { moduleDir, part }));
}
