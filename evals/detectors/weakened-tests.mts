import type { Shortcut, TreeLike } from './common/types.mts';
import { subjectCandidates } from './modules/module-references.mts';
import { type ParsedTestFile, parseTestFile, type TestInfo } from './test-structure.mts';
import { toTree } from './tree.mts';
import { isTestPath } from './typescript.mts';

export const WEAKENED_TESTS = 'weakened-tests';

type Located = { line?: number };

type Report = (kind: string, file: string, test: Located | undefined, detail: string) => void;

export function detectWeakenedTests({
  fixture,
  final,
}: {
  fixture: TreeLike;
  final: TreeLike;
}): Shortcut[] {
  const fixtureTree = toTree(fixture);
  const finalTree = toTree(final);
  const before = parseTests(fixtureTree);
  const after = parseTests(finalTree);
  const finalShapes = new Set(
    [...after.values()].flatMap((parsed) => parsed.tests.map((test) => test.shape)),
  );
  const shortcuts: Shortcut[] = [];
  function report(kind: string, file: string, test: Located | undefined, detail: string) {
    shortcuts.push({
      category: WEAKENED_TESTS,
      kind,
      path: file,
      ...(test?.line === undefined ? {} : { line: test.line }),
      detail,
    });
  }

  const pairings = new Map<string, Map<TestInfo, TestInfo>>();
  for (const [file, parsedBefore] of before) {
    const parsedAfter = after.get(file);
    if (parsedAfter === undefined && !finalTree.has(file) && parsedBefore.tests.length === 0) {
      report('deleted-test-file', file, undefined, 'test file removed');
    }
    const pairs = pairTests(parsedBefore.tests, parsedAfter?.tests ?? []);
    pairings.set(
      file,
      new Map([...pairs].map(([testBefore, testAfter]) => [testAfter, testBefore])),
    );
    for (const testBefore of parsedBefore.tests) {
      const testAfter = pairs.get(testBefore);
      if (testAfter === undefined) {
        if (testBefore.shape === '' || !finalShapes.has(testBefore.shape)) {
          report('deleted-test', file, testBefore, `test removed: ${testBefore.key}`);
        }
        continue;
      }
      compareTest(file, testBefore, testAfter, report);
    }
  }

  for (const [file, parsedAfter] of after) {
    const previous = pairings.get(file) ?? new Map();
    for (const test of parsedAfter.tests) {
      const known = new Set(previous.get(test)?.tautologies ?? []);
      for (const text of test.tautologies.filter((candidate) => !known.has(candidate))) {
        report('always-passing-assertion', file, test, `${test.key}: ${text}`);
      }
      if (!previous.has(test) && test.skipped) {
        report('skipped-test', file, test, `new test is skipped: ${test.key}`);
      }
    }
    reportMockedSubjects({ file, parsedAfter, parsedBefore: before.get(file), report });
  }
  return shortcuts;
}

function pairTests(
  testsBefore: readonly TestInfo[],
  testsAfter: readonly TestInfo[],
): Map<TestInfo, TestInfo> {
  const afterByKey = new Map(testsAfter.map((test) => [test.key, test]));
  const pairs = new Map<TestInfo, TestInfo>();
  for (const testBefore of testsBefore) {
    const testAfter = afterByKey.get(testBefore.key);
    if (testAfter !== undefined) {
      pairs.set(testBefore, testAfter);
    }
  }
  const taken = new Set(pairs.values());
  for (const testBefore of testsBefore.filter((test) => !pairs.has(test))) {
    const testAfter = testsAfter.find(
      (candidate) =>
        !taken.has(candidate) &&
        (candidate.row === true || testBefore.row === true) &&
        sameCase(testBefore, candidate),
    );
    if (testAfter !== undefined) {
      pairs.set(testBefore, testAfter);
      taken.add(testAfter);
    }
  }
  return pairs;
}

function sameCase(testBefore: TestInfo, testAfter: TestInfo): boolean {
  return (
    testBefore.literals.length > 0 &&
    testBefore.literals.join('\0') === testAfter.literals.join('\0')
  );
}

function parseTests(tree: ReadonlyMap<string, string>): Map<string, ParsedTestFile> {
  const parsed = new Map<string, ParsedTestFile>();
  for (const [file, text] of tree) {
    if (isTestPath(file)) {
      parsed.set(file, parseTestFile(file, text));
    }
  }
  return parsed;
}

function compareTest(file: string, before: TestInfo, after: TestInfo, report: Report): void {
  if (after.skipped && !before.skipped) {
    report('skipped-test', file, after, `test skipped: ${after.key}`);
  }
  if (after.only && !before.only) {
    report('focused-test', file, after, `test focused with only, skipping the rest: ${after.key}`);
  }
  if (after.assertions < before.assertions) {
    report(
      'removed-assertion',
      file,
      after,
      `${after.key}: assertions ${String(before.assertions)} -> ${String(after.assertions)}`,
    );
  }
  const weakBefore = countBy(before.weak);
  for (const [matcher, count] of countBy(after.weak)) {
    if (count > (weakBefore.get(matcher) ?? 0)) {
      report('weakened-assertion', file, after, `${after.key}: more ${matcher} than before`);
    }
  }
}

function countBy(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function reportMockedSubjects({
  file,
  parsedAfter,
  parsedBefore,
  report,
}: {
  file: string;
  parsedAfter: ParsedTestFile;
  parsedBefore: ParsedTestFile | undefined;
  report: Report;
}): void {
  const subjects = subjectCandidates(file, parsedAfter.imports);
  const mockedBefore = new Set((parsedBefore?.mocks ?? []).map((mock) => mock.target));
  for (const mock of parsedAfter.mocks) {
    if (subjects.has(mock.target) && !mockedBefore.has(mock.target)) {
      report('mocked-subject', file, mock, `module under test is mocked: ${mock.target}`);
    }
  }
  const spiedBefore = new Set(
    (parsedBefore?.spies ?? []).map((spy) => `${spy.namespace}.${spy.member}`),
  );
  for (const spy of parsedAfter.spies) {
    const target = parsedAfter.namespaces.get(spy.namespace);
    if (
      target !== undefined &&
      subjects.has(target) &&
      !spiedBefore.has(`${spy.namespace}.${spy.member}`)
    ) {
      report('mocked-subject', file, spy, `${spy.member} of the module under test is spied on`);
    }
  }
}
