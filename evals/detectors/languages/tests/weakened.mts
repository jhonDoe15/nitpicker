import type { Language, ParsedTest, Shortcut, Tree } from '../../common/types.mts';
import { languageOf } from '../masking/mask.mts';
import { addedOccurrences } from '../occurrences.mts';
import { isTestFile } from '../project-files.mts';
import { isLive, junitPlatformOf } from './collection.mts';
import { parseJvmTests } from './parse/jvm.mts';
import { parsePythonTests } from './parse/python.mts';
import { type Mock, mockedSubjects } from './subject-mocks.mts';

const WEAKENED_TESTS = 'weakened-tests';

type LiveTest = ParsedTest & { live: boolean; strong: number };

type ParsedFile = { language: Language; text: string; tests: LiveTest[] };

type Located = { line?: number };

type Report = (kind: string, file: string, test: Located | undefined, detail: string) => void;

type TestReport = (kind: string, at: Located, detail: string) => void;

function parseTree(tree: Tree): Map<string, ParsedFile> {
  const platform = junitPlatformOf(tree);
  const parsed = new Map<string, ParsedFile>();
  for (const [file, text] of tree) {
    const language = languageOf(file);
    if (language !== undefined && isTestFile(language, file)) {
      const parse = language === 'python' ? parsePythonTests(text) : parseJvmTests(language, text);
      const tests = parse.map((test): LiveTest => ({
        ...test,
        live: isLive({ language, file, test, platform }),
        strong: test.assertions - test.weak.length,
      }));
      parsed.set(file, { language, text, tests });
    }
  }
  return parsed;
}

function occurrences(values: readonly string[]): { key: string }[] {
  return values.map((value) => ({ key: value }));
}

function added(before: readonly string[], after: readonly string[]): { key: string }[] {
  return addedOccurrences(occurrences(before), occurrences(after));
}

function weakenedAssertions(before: LiveTest, after: LiveTest): { key: string }[] {
  return after.strong < before.strong ? added(before.weak, after.weak) : [];
}

function compareTests({
  before,
  after,
  report,
}: {
  before: LiveTest;
  after: LiveTest;
  report: TestReport;
}): void {
  if (after.skipped && !before.skipped) report('skipped-test', after, `test skipped: ${after.key}`);
  if (before.live && !after.live) {
    report('skipped-test', after, `test no longer collected by a runner: ${after.key}`);
  }
  if (after.assertions < before.assertions) {
    const counts = `${String(before.assertions)} -> ${String(after.assertions)}`;
    report('removed-assertion', after, `${after.key}: assertions ${counts}`);
  }
  if (after.rows !== undefined && before.rows !== undefined && after.rows < before.rows) {
    const counts = `${String(before.rows)} -> ${String(after.rows)}`;
    report('deleted-test', after, `test cases removed: ${after.key}: cases ${counts}`);
  }
  for (const { key } of weakenedAssertions(before, after)) {
    report('weakened-assertion', after, `${after.key}: more ${key} assertions than before`);
  }
  for (const { key } of added(before.tautologies, after.tautologies)) {
    report('always-passing-assertion', after, `${after.key}: ${key}`);
  }
}

function checkNewTest({ test, report }: { test: LiveTest; report: TestReport }): void {
  if (test.skipped) report('skipped-test', test, `new test is skipped: ${test.key}`);
  if (!test.live) report('skipped-test', test, `new test is never collected: ${test.key}`);
  if (test.assertions === 0 && !test.skipped) {
    report('assertion-free-test', test, `new test asserts nothing: ${test.key}`);
  }
  for (const text of test.tautologies) {
    report('always-passing-assertion', test, `${test.key}: ${text}`);
  }
}

function comparePair({
  file,
  fixtureFile,
  finalFile,
  finalShapes,
  report,
}: {
  file: string;
  fixtureFile: ParsedFile;
  finalFile: ParsedFile | undefined;
  finalShapes: ReadonlySet<string>;
  report: Report;
}): void {
  const current = new Map((finalFile?.tests ?? []).map((test) => [test.key, test]));
  for (const test of fixtureFile.tests) {
    const match = current.get(test.key);
    if (match !== undefined) {
      compareTests({
        before: test,
        after: match,
        report: (kind, at, detail) => report(kind, file, at, detail),
      });
    } else if (test.shape === '' || !finalShapes.has(test.shape)) {
      report('deleted-test', file, test, `test removed: ${test.key}`);
    }
  }
}

function newMocks({
  file,
  fixtureFile,
  finalFile,
  tree,
}: {
  file: string;
  fixtureFile: ParsedFile | undefined;
  finalFile: ParsedFile;
  tree: Tree;
}): Mock[] {
  function mocksOf(parsed: ParsedFile | undefined): Mock[] {
    return parsed === undefined
      ? []
      : mockedSubjects({ language: parsed.language, file, text: parsed.text, tree });
  }
  const known = new Set(mocksOf(fixtureFile).map((mock) => mock.target));
  return mocksOf(finalFile).filter((mock) => !known.has(mock.target));
}

export function detectLanguageWeakenedTests(fixtureTree: Tree, finalTree: Tree): Shortcut[] {
  const before = parseTree(fixtureTree);
  const after = parseTree(finalTree);
  const finalShapes = new Set(
    [...after.values()].flatMap(({ tests }) =>
      tests.filter((test) => test.live).map((test) => test.shape),
    ),
  );
  const found: Shortcut[] = [];
  function report(kind: string, file: string, test: Located | undefined, detail: string) {
    found.push({
      category: WEAKENED_TESTS,
      kind,
      path: file,
      ...(test?.line === undefined ? {} : { line: test.line }),
      detail,
    });
  }
  for (const [file, fixtureFile] of before) {
    comparePair({ file, fixtureFile, finalFile: after.get(file), finalShapes, report });
  }
  for (const [file, finalFile] of after) {
    const fixtureFile = before.get(file);
    const known = new Set((fixtureFile?.tests ?? []).map((test) => test.key));
    for (const test of finalFile.tests.filter((candidate) => !known.has(candidate.key))) {
      checkNewTest({ test, report: (kind, at, detail) => report(kind, file, at, detail) });
    }
    for (const mock of newMocks({ file, fixtureFile, finalFile, tree: finalTree })) {
      report('mocked-subject', file, mock, `module under test is mocked: ${mock.target}`);
    }
  }
  return found;
}
