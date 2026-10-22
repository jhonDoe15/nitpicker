import { describe, expect, it } from 'vitest';
import { baseLineOf, parseLineShifts } from './line-shifts.mjs';
import {
  baseMutationTargets,
  changedCodeMutants,
  hasWeakeningCandidates,
  mutationTargetsWithTestedModules,
  weakenedTestFindings,
} from './weakened-mutants.mjs';

function mutant(status, line, overrides = {}) {
  return {
    status,
    mutatorName: 'ConditionalExpression',
    replacement: 'true',
    original: 'n < 5',
    location: { start: { line, column: 7 } },
    ...overrides,
  };
}

const mutationScope = {
  targets: ['src/classify.ts:2-2', 'src/other.ts:1-1'],
  testedModules: ['src/classify.ts'],
};

describe('mutation scope with the tested modules', () => {
  it('mutates a tested module whole instead of its changed lines', () => {
    expect(mutationTargetsWithTestedModules(mutationScope.targets, ['src/classify.ts'])).toEqual([
      'src/other.ts:1-1',
      'src/classify.ts',
    ]);
  });

  it('keeps the usual findings to the changed lines and to the other changed files', () => {
    const report = {
      files: {
        'src/classify.ts': { mutants: [mutant('Survived', 1), mutant('Survived', 2)] },
        'src/other.ts': { mutants: [mutant('Survived', 1)] },
      },
    };

    expect(changedCodeMutants(report, mutationScope)).toEqual({
      files: {
        'src/classify.ts': { mutants: [mutant('Survived', 2)] },
        'src/other.ts': { mutants: [mutant('Survived', 1)] },
      },
    });
  });
});

describe('mutants the changed tests let escape', () => {
  const headReport = {
    files: {
      'src/classify.ts': {
        mutants: [
          mutant('Survived', 1),
          mutant('NoCoverage', 3, {
            mutatorName: 'StringLiteral',
            replacement: '""',
            original: "'low'",
          }),
          mutant('Survived', 4),
          mutant('Killed', 5),
          mutant('Survived', 2),
        ],
      },
    },
  };
  const baseReport = {
    files: {
      'src/classify.ts': {
        mutants: [
          mutant('Killed', 1),
          mutant('Timeout', 3, {
            mutatorName: 'StringLiteral',
            replacement: '""',
            original: "'low'",
          }),
          mutant('Survived', 4),
          mutant('Killed', 5),
        ],
      },
    },
  };

  it('need a base run only when a tested module has an escaped mutant off the changed lines', () => {
    expect(hasWeakeningCandidates(headReport, mutationScope)).toBe(true);
    expect(
      hasWeakeningCandidates(
        { files: { 'src/classify.ts': { mutants: [mutant('Killed', 1), mutant('Survived', 2)] } } },
        mutationScope,
      ),
    ).toBe(false);
  });

  it('fail when the base tests caught them, and name the weakened tests', () => {
    const findings = weakenedTestFindings({
      headReport,
      baseReport,
      mutationScope,
      analyzerName: 'mutation',
    });

    expect(findings).toEqual([
      {
        tool: 'mutation',
        rule: 'mutant-survived',
        path: 'src/classify.ts',
        message:
          'This change weakened the tests of src/classify.ts: the base tests caught this ConditionalExpression mutant (`n < 5` replaced with `true`), but it survives now. Restore the assertion that caught it, or add one. If this is intended, add {"rule":"mutant-survived","paths":["src/classify.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        identity: expect.any(String),
        classification: 'enforceable',
        location: { line: 1, column: 7 },
      },
      {
        tool: 'mutation',
        rule: 'mutant-nocoverage',
        path: 'src/classify.ts',
        message:
          'This change weakened the tests of src/classify.ts: the base tests caught this StringLiteral mutant (`\'low\'` replaced with `""`), but no test runs it now. Restore the assertion that caught it, or add one. If this is intended, add {"rule":"mutant-nocoverage","paths":["src/classify.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        identity: expect.any(String),
        classification: 'enforceable',
        location: { line: 3, column: 7 },
      },
    ]);
    expect(new Set(findings.map(({ identity }) => identity)).size).toBe(2);
  });

  it('match a mutant through the lines the change inserted above it', () => {
    const moved = {
      files: { 'src/classify.ts': { mutants: [mutant('Survived', 9)] } },
    };
    const inserted = {
      targets: ['src/classify.ts:1-8'],
      testedModules: ['src/classify.ts'],
      lineShifts: new Map([['src/classify.ts', [{ baseCount: 0, headStart: 1, headCount: 8 }]]]),
    };

    expect(
      weakenedTestFindings({
        headReport: moved,
        baseReport,
        mutationScope: inserted,
        analyzerName: 'mutation',
      }).map(({ location }) => location),
    ).toEqual([{ line: 9, column: 7 }]);
  });

  it('leave a legacy survivor alone when new code with the same mutant sits above it', () => {
    const scope = {
      targets: ['src/classify.ts:1-2'],
      testedModules: ['src/classify.ts'],
      lineShifts: new Map([['src/classify.ts', [{ baseCount: 0, headStart: 1, headCount: 2 }]]]),
    };
    const head = {
      files: { 'src/classify.ts': { mutants: [mutant('Survived', 1), mutant('Survived', 3)] } },
    };
    const base = {
      files: { 'src/classify.ts': { mutants: [mutant('Survived', 1), mutant('Killed', 2)] } },
    };

    expect(
      weakenedTestFindings({ headReport: head, baseReport: base, mutationScope: scope }),
    ).toEqual([]);
  });

  it('match a mutant below deleted lines, which leave no changed range', () => {
    const scope = {
      targets: [],
      testedModules: ['src/classify.ts'],
      lineShifts: new Map([['src/classify.ts', [{ baseCount: 1, headStart: 2, headCount: 0 }]]]),
    };
    const head = { files: { 'src/classify.ts': { mutants: [mutant('Survived', 3)] } } };
    const base = {
      files: { 'src/classify.ts': { mutants: [mutant('Survived', 3), mutant('Killed', 4)] } },
    };

    expect(baseMutationTargets(head, scope)).toEqual(['src/classify.ts:4-4']);
    expect(
      weakenedTestFindings({
        headReport: head,
        baseReport: base,
        mutationScope: scope,
        analyzerName: 'mutation',
      }).map(({ location }) => location),
    ).toEqual([{ line: 3, column: 7 }]);
  });

  it('rerun only the escaped mutants on the base when the module is unchanged', () => {
    const unchangedModule = { targets: ['src/other.ts:1-1'], testedModules: ['src/classify.ts'] };
    const multiLine = {
      files: {
        'src/classify.ts': {
          mutants: [
            mutant('Survived', 4, {
              location: { start: { line: 4, column: 1 }, end: { line: 6 } },
            }),
            mutant('Survived', 8),
            mutant('Killed', 9),
          ],
        },
      },
    };

    expect(baseMutationTargets(multiLine, unchangedModule)).toEqual([
      'src/classify.ts:4-6',
      'src/classify.ts:8-8',
    ]);
    expect(baseMutationTargets(headReport, mutationScope)).toEqual([
      'src/classify.ts:1-1',
      'src/classify.ts:3-3',
      'src/classify.ts:4-4',
    ]);
  });

  it('match mutants of an unchanged module by position against the partial base run', () => {
    const unchangedModule = { targets: [], testedModules: ['src/classify.ts'] };
    const partialBase = {
      files: {
        'src/classify.ts': {
          mutants: [mutant('Killed', 2), mutant('Survived', 4)],
        },
      },
    };

    expect(
      weakenedTestFindings({
        headReport,
        baseReport: partialBase,
        mutationScope: unchangedModule,
        analyzerName: 'mutation',
      }).map(({ location }) => location),
    ).toEqual([{ line: 2, column: 7 }]);
  });
});

describe('lines of the head mapped to the base', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -2,0 +3,2 @@ const a = 1;',
    '+one',
    '+two',
    '@@ -7,3 +9 @@ const b = 2;',
    '-x',
    '-y',
    '-z',
    '+w',
    'diff --git a/src/gone.ts b/src/gone.ts',
    '--- a/src/gone.ts',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-gone',
    '',
  ].join('\n');

  it('read the hunks of every changed file, deleted lines included', () => {
    expect(parseLineShifts(diff)).toEqual(
      new Map([
        [
          'src/a.ts',
          [
            { baseCount: 0, headStart: 3, headCount: 2 },
            { baseCount: 3, headStart: 9, headCount: 1 },
          ],
        ],
      ]),
    );
  });

  it('move each unchanged line by the lines written above it, and drop written lines', () => {
    const hunks = parseLineShifts(diff).get('src/a.ts');

    expect([1, 2, 3, 4, 5, 8, 9, 10, 12].map((line) => baseLineOf(hunks, line))).toEqual([
      1,
      2,
      undefined,
      undefined,
      3,
      6,
      undefined,
      10,
      12,
    ]);
    expect(baseLineOf([{ baseCount: 2, headStart: 0, headCount: 0 }], 1)).toBe(3);
  });
});
