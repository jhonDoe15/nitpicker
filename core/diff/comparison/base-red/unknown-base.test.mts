import { describe, expect, it } from 'vitest';
import type { AnalyzerReport, Finding, ReportEntry } from '../../../../shared/values/findings.mts';
import {
  baseFailuresOf as baseFailuresOfJs,
  baseNoteOf as baseNoteOfJs,
  changedByDiff as changedByDiffJs,
  isTestResultFinding as isTestResultFindingJs,
  redBaseAnalyzers as redBaseAnalyzersJs,
  testFailuresOf as testFailuresOfJs,
  unknownOnBaseFor as unknownOnBaseForJs,
} from './unknown-base.mjs';

type RunLike = {
  readonly reports: Map<string, AnalyzerReport>;
  readonly toolErrors: readonly ReportEntry[];
  readonly skipped: Map<string, unknown>;
};

type RunSpec = {
  readonly reports?: Readonly<Record<string, readonly Finding[]>>;
  readonly toolErrors?: readonly ReportEntry[];
  readonly skipped?: Readonly<Record<string, string>>;
};

type FindingTest = (finding: Finding) => boolean;

const isTestResultFinding: FindingTest = isTestResultFindingJs;
const changedByDiff: (finding: Finding, touchedCode: unknown) => boolean = changedByDiffJs;
const testFailuresOf: (report: AnalyzerReport | undefined) => Finding[] = testFailuresOfJs;
const redBaseAnalyzers: (request: {
  readonly names: readonly string[];
  readonly baseRun: RunLike;
  readonly headRun: RunLike;
}) => Map<string, Finding[]> = redBaseAnalyzersJs;
const baseFailuresOf: (request: {
  readonly name: string;
  readonly baseRun: RunLike;
  readonly headRun: RunLike;
  readonly redBase: Map<string, Finding[]>;
}) => Finding[] | undefined = baseFailuresOfJs;
const unknownOnBaseFor: (
  failures: readonly Finding[],
  touchedCode: unknown,
) => FindingTest | undefined = unknownOnBaseForJs;
const baseNoteOf: (name: string, finding: Finding) => unknown = baseNoteOfJs;

function coverageOf(failures: readonly Finding[], touchedCode: unknown): FindingTest {
  const covers = unknownOnBaseFor(failures, touchedCode);
  if (covers === undefined) {
    throw new Error('expected the failures to cover findings');
  }
  return covers;
}

const testsFailed: Finding = {
  tool: 'coverage',
  rule: 'tests-failed',
  path: 'test/a.test.ts',
  identity: 'tests-failed',
  message: '1 test fails',
  classification: 'tool-error',
};
const skipped = { ...testsFailed, tool: 'mutation', rule: 'tests-failed-skipped' };
const toolSkipped = { ...testsFailed, tool: 'errorprone', rule: 'tool-skipped' };
const crashed = { ...testsFailed, rule: 'python-failed' };
const lint: Finding = {
  tool: 'ruff',
  rule: 'F401',
  path: 'a.py',
  identity: 'a',
  message: 'unused',
  classification: 'enforceable',
};

function run({ reports = {}, toolErrors = [], skipped: skippedTools = {} }: RunSpec): RunLike {
  return {
    reports: new Map(Object.entries(reports).map(([name, findings]) => [name, { findings }])),
    toolErrors,
    skipped: new Map(Object.entries(skippedTools)),
  };
}

describe('which findings depend on test results', () => {
  it.each([
    ['crap-score-limit', true],
    ['crap-coverage-unknown', true],
    ['changed-branch-coverage', true],
    ['mutant-survived', true],
    ['mutant-nocoverage', true],
    ['mutant-timeout', true],
    ['slow-test', true],
    ['test-console-output', true],
    ['uncovered-function', true],
    ['uncovered-method', true],
    ['line-coverage', true],
    ['function-lines-limit', false],
    ['no-production-runtime', false],
    ['F401', false],
  ])('%s: %s', (rule, expected) => {
    expect(isTestResultFinding({ ...lint, rule })).toBe(expected);
  });
});

describe('changedByDiff', () => {
  const touchedCode = {
    changedLines: new Map([
      ['added.py', { path: 'added.py', added: true, ranges: [[1, 40]], inserted: [] }],
      ['edited.py', { path: 'edited.py', added: false, ranges: [[10, 12]], inserted: [] }],
      [
        'deleted.py',
        { path: 'deleted.py', added: false, ranges: [], inserted: [], deletions: [15] },
      ],
    ]),
  };
  const at = (path: string, location?: { line: number; endLine?: number }): Finding => ({
    ...lint,
    path,
    ...(location === undefined ? {} : { location }),
  });

  it.each([
    ['a finding in an added file', at('added.py'), true],
    ['a finding on an edited line', at('edited.py', { line: 11 }), true],
    [
      'a finding in a function whose body has an edited line',
      at('edited.py', { line: 5, endLine: 10 }),
      true,
    ],
    [
      'a finding on an untouched line of an edited file',
      at('edited.py', { line: 20, endLine: 30 }),
      false,
    ],
    ['a finding without a location in an edited file', at('edited.py'), false],
    [
      'a function with lines deleted inside its body',
      at('deleted.py', { line: 10, endLine: 20 }),
      true,
    ],
    [
      'a function next to a deletion just after its last line',
      at('deleted.py', { line: 10, endLine: 15 }),
      false,
    ],
    [
      'a function next to a deletion just before its first line',
      at('deleted.py', { line: 16, endLine: 20 }),
      false,
    ],
    ['a finding in an untouched file', at('other.py', { line: 1 }), false],
  ])('%s', (_name, finding, expected) => {
    expect(changedByDiff(finding, touchedCode)).toBe(expected);
  });

  it('is false without any change information', () => {
    expect(changedByDiff(at('added.py'), undefined)).toBe(false);
  });
});

describe('testFailuresOf', () => {
  it('returns the tool errors when every one is a failing-tests rule', () => {
    expect(testFailuresOf({ findings: [lint, testsFailed, skipped] })).toEqual([
      testsFailed,
      skipped,
    ]);
  });

  it('ignores a skipped tool next to the failing tests', () => {
    expect(testFailuresOf({ findings: [testsFailed, toolSkipped] })).toEqual([testsFailed]);
  });

  it('returns nothing when another tool error comes with them', () => {
    expect(testFailuresOf({ findings: [testsFailed, crashed] })).toEqual([]);
  });

  it('returns nothing without a report or without a tool error', () => {
    expect([testFailuresOf(undefined), testFailuresOf({ findings: [lint] })]).toEqual([[], []]);
  });
});

describe('redBaseAnalyzers', () => {
  const names = ['coverage', 'ruff'];

  it('finds an analyzer whose base tests fail and whose head is clean', () => {
    const baseRun = run({ reports: { coverage: [testsFailed], ruff: [lint] } });
    const headRun = run({ reports: { coverage: [], ruff: [] } });

    expect(redBaseAnalyzers({ names, baseRun, headRun })).toEqual(
      new Map([['coverage', [testsFailed]]]),
    );
  });

  it.each<[string, RunSpec]>([
    ['the head tests fail too', { reports: { coverage: [testsFailed] } }],
    [
      'the head analyzer crashed',
      { reports: { coverage: [] }, toolErrors: [{ tool: 'coverage' }] },
    ],
    ['the head analyzer has no report', { reports: {} }],
  ])('is empty when %s', (_name, head) => {
    const baseRun = run({ reports: { coverage: [testsFailed] } });

    expect(redBaseAnalyzers({ names, baseRun, headRun: run(head) })).toEqual(new Map());
  });

  it('stays red when the base also skipped a tool', () => {
    const baseRun = run({
      reports: { coverage: [testsFailed, toolSkipped] },
      toolErrors: [{ tool: 'coverage', rule: 'tool-skipped' }],
    });
    const headRun = run({ reports: { coverage: [] } });

    expect(redBaseAnalyzers({ names, baseRun, headRun })).toEqual(
      new Map([['coverage', [testsFailed]]]),
    );
  });

  it('stays red when only the green head skipped a tool', () => {
    const baseRun = run({ reports: { coverage: [testsFailed] } });
    const headRun = run({
      reports: { coverage: [toolSkipped] },
      toolErrors: [{ tool: 'coverage', rule: 'tool-skipped' }],
    });

    expect(redBaseAnalyzers({ names, baseRun, headRun })).toEqual(
      new Map([['coverage', [testsFailed]]]),
    );
  });

  it('is empty when no test failed on the base, only the analyzers that depend on them', () => {
    const baseRun = run({ reports: { coverage: [skipped] } });

    expect(
      redBaseAnalyzers({ names, baseRun, headRun: run({ reports: { coverage: [] } }) }),
    ).toEqual(new Map());
  });

  it('is empty when the base analyzer crashed as well', () => {
    const baseRun = run({
      reports: { coverage: [testsFailed] },
      toolErrors: [{ tool: 'coverage' }],
    });

    expect(
      redBaseAnalyzers({ names, baseRun, headRun: run({ reports: { coverage: [] } }) }),
    ).toEqual(new Map());
  });
});

describe('baseFailuresOf', () => {
  const redBase = new Map([['coverage', [testsFailed]]]);
  const headRun = run({ reports: { coverage: [], crap: [] } });

  it('is the failures for the red analyzer and for one skipped because of it', () => {
    const baseRun = run({ reports: { coverage: [testsFailed] }, skipped: { crap: 'coverage' } });

    expect(
      ['coverage', 'crap', 'ruff'].map((name) =>
        baseFailuresOf({ name, baseRun, headRun, redBase }),
      ),
    ).toEqual([[testsFailed], [testsFailed], undefined]);
  });

  it('is undefined for an analyzer skipped because of another failure', () => {
    const baseRun = run({ skipped: { crap: 'duplicates' } });

    expect(baseFailuresOf({ name: 'crap', baseRun, headRun, redBase })).toBeUndefined();
  });

  it('is undefined when the head of the skipped analyzer did not run', () => {
    const baseRun = run({ skipped: { crap: 'coverage' } });

    expect(
      baseFailuresOf({ name: 'crap', baseRun, headRun: run({ reports: {} }), redBase }),
    ).toBeUndefined();
  });
});

describe('unknownOnBaseFor', () => {
  const crap = { ...lint, rule: 'crap-score-limit' };
  const inModule = (path: string, finding = crap): Finding => ({ ...finding, path });

  it('covers the test results of the whole analyzer when a failure names no module', () => {
    const unknown = coverageOf([testsFailed], { changedLines: new Map() });

    expect([unknown(inModule('a/src/A.java')), unknown(lint)]).toEqual([true, false]);
  });

  it('covers only the modules whose tests fail', () => {
    const unknown = coverageOf([{ ...testsFailed, symbol: 'core' }], undefined);

    expect([
      unknown(inModule('core/src/A.java')),
      unknown(inModule('coreutils/src/A.java')),
      unknown(inModule('api/src/A.java')),
    ]).toEqual([true, false, false]);
  });

  it('treats the root module as the whole project', () => {
    const unknown = coverageOf([{ ...testsFailed, symbol: '.' }], undefined);

    expect(unknown(inModule('api/src/A.java'))).toBe(true);
  });

  it('covers only the listed directories when a root project fails', () => {
    const unknown = coverageOf(
      [{ ...testsFailed, symbol: 'src/main/java,src/test/java' }],
      undefined,
    );

    expect([
      unknown(inModule('src/main/java/A.java')),
      unknown(inModule('src/test/java/ATest.java')),
      unknown(inModule('api/src/main/java/B.java')),
    ]).toEqual([true, true, false]);
  });

  it('knows nothing about the base when the change removes tests', () => {
    expect(unknownOnBaseFor([testsFailed], { testsRemoved: true })).toBeUndefined();
  });
});

describe('baseNoteOf', () => {
  it('keeps what the report needs to explain the note', () => {
    expect(baseNoteOf('python', testsFailed)).toEqual({
      tool: 'python',
      snapshot: 'base',
      rule: 'tests-failed',
      path: 'test/a.test.ts',
      message: '1 test fails',
    });
  });
});
