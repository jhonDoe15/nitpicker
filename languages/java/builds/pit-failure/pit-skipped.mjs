import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const UNMUTATED_FILE = 'unmutated-failures.txt';
const SKIPPED_FILE = 'skipped-tests.txt';
const SKIPPED_RULE = 'pit-skipped-tests';
const LISTED_TESTS = 5;
const NOT_PASSING = /testClass=([^,\s]+), name=(.+?)\]? did not pass without mutation/u;
const JUNIT_METHOD = /\[method:([^\]]+)\]/u;

export function pitPartFiles(pitRoot, name) {
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

function unmutatedFailureLines(output) {
  return String(output)
    .split(/\r?\n/u)
    .filter((line) => NOT_PASSING.test(line));
}

export function writeUnmutatedFailures(pitDir, output) {
  const lines = unmutatedFailureLines(output);
  if (lines.length > 0) {
    writeFileSync(path.join(pitDir, UNMUTATED_FILE), `${lines.join('\n')}\n`);
  }
  return lines.length > 0;
}

function simpleName(testClass) {
  return testClass.split('.').at(-1);
}

export function unmutatedFailures(output) {
  const tests = unmutatedFailureLines(output).map((line) => {
    const [, testClass, name] = NOT_PASSING.exec(line);
    const method = JUNIT_METHOD.exec(name)?.[1];
    return { testClass, label: `${simpleName(testClass)}.${method ?? name}` };
  });
  return [...new Map(tests.map((test) => [test.label, test])).values()];
}

export function unmutatedSummary(tests) {
  const classes = new Set(tests.map(({ testClass }) => simpleName(testClass)));
  const where = classes.size === 1 ? `in ${[...classes][0]}` : `in ${classes.size} test classes`;
  const [noun, verb] = tests.length === 1 ? ['test', 'it passes'] : ['tests', 'they pass'];
  return (
    `${tests.length} ${noun} ${where} did not pass without mutation under PIT; ` +
    `${verb} under the build's test task`
  );
}

export function leadWithUnmutatedSummary(pitRoot, part, message) {
  const entry = pitPartFiles(pitRoot, UNMUTATED_FILE).find((found) => found.part === part);
  const tests = entry === undefined ? [] : unmutatedFailures(readFileSync(entry.file, 'utf8'));
  return tests.length === 0 ? message : `${unmutatedSummary(tests)}. ${message}`;
}

export function writeSkippedTests(pitDir) {
  const source = path.join(pitDir, UNMUTATED_FILE);
  if (existsSync(source)) {
    writeFileSync(path.join(pitDir, SKIPPED_FILE), readFileSync(source, 'utf8'));
  }
}

function skippedNotice(tests, { moduleDir, part }) {
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

export function pitSkippedFindings(reportRoot, moduleDir = '') {
  return pitPartFiles(path.join(reportRoot, 'pit'), SKIPPED_FILE)
    .map(({ part, file }) => ({ part, tests: unmutatedFailures(readFileSync(file, 'utf8')) }))
    .filter(({ tests }) => tests.length > 0)
    .map(({ part, tests }) => skippedNotice(tests, { moduleDir, part }));
}
