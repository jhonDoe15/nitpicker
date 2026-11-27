import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../../shared/test-support/temp-projects.mts';
import { argumentSetOf } from '../engine-arguments.mts';
import { handBackOf, joinedHandBacks, keptRows, mayReportOf, recompiledHandBacks } from './plan-rows.mts';

const projectWith = useTempProjects('nitpicker-errorprone-rows-');

function sourceSet() {
  const root = projectWith({
    'A.java': 'class A {}',
    'B.java': 'class B {}',
    'quiet/C.java': 'class C {}',
    'quiet/lombok.config': 'lombok.addSuppressWarnings = false\n',
  });
  const sources = ['A.java', 'B.java', 'quiet/C.java'].map((name) => path.join(root, name));
  return argumentSetOf(['--sources', ...sources, ''].join('\n'));
}

describe('keptRows', () => {
  it('keeps the unswitchable check only outside the files Error Prone compiles, and drops Lombok checks there', () => {
    const set = sourceSet();
    const [a = '', b = '', c = ''] = set.sources;
    const row = (file: string, rule: string) => ({
      file,
      rule,
      line: 1,
      column: 1,
      message: `[${rule}] x`,
    });
    const rows = [
      row(a, 'UnicodeDirectionalityCharacters'),
      row(b, 'UnicodeDirectionalityCharacters'),
      row(c, 'MissingBraces'),
      row(c, 'SystemOut'),
    ];

    const plan = { kind: 'narrowed', files: [a, b], checks: ['SystemOut'] } as const;
    const context = { set, plan, lombokOff: ['MissingBraces'], excluded: () => false };

    expect(keptRows(rows, { ...context, plan: { ...plan, files: [a] } })).toStrictEqual([
      rows[1],
      rows[3],
    ]);
    expect(keptRows(rows, { ...context, plan: { ...plan, files: [a, c] } })).toStrictEqual([
      rows[1],
    ]);
    expect(
      keptRows(rows, { ...context, excluded: (file) => file === b, plan: { kind: 'none' } }),
    ).toStrictEqual([rows[0], rows[3]]);
  });
});

describe('handBackOf', () => {
  it('reads the checks the engine leaves to Error Prone per file, apart from the may-report answer', () => {
    const report = {
      findings: [
        { file: '/a/A.java', line: 1, column: 1, rule: '_HandBack', message: 'RestrictedApi' },
        { file: '/a/A.java', line: 1, column: 1, rule: '_MayReport', message: 'DeeplyNested' },
        { file: '/a/B.java', line: 1, column: 1, rule: '_MayReport', message: '' },
        {
          file: '/a/B.java',
          line: 3,
          column: 5,
          rule: 'RestrictedApi',
          message: '[RestrictedApi] x',
        },
      ],
    };

    expect(handBackOf(report)).toStrictEqual(new Map([['/a/A.java', ['RestrictedApi']]]));
    expect(mayReportOf(report)).toStrictEqual(
      new Map([
        ['/a/A.java', ['DeeplyNested']],
        ['/a/B.java', []],
      ]),
    );
  });

  it('joins two hand-back maps without repeating a check', () => {
    const first = new Map([['/a/A.java', ['SystemOut']]]);
    const second = new Map([
      ['/a/A.java', ['RestrictedApi', 'SystemOut']],
      ['/a/B.java', ['RestrictedApi']],
    ]);

    expect(joinedHandBacks(first, second)).toStrictEqual(
      new Map([
        ['/a/A.java', ['SystemOut', 'RestrictedApi']],
        ['/a/B.java', ['RestrictedApi']],
      ]),
    );
  });
});

describe('recompiledHandBacks', () => {
  const row = (file: string, rule: string, message: string) => ({ file, rule, line: 1, column: 1, message });
  const suggested = row('A.java', 'StaticMockMember', "[StaticMockMember] x\n  Did you mean 'Runnable a;'?");
  const plain = row('B.java', 'TruthAssertExpected', '[TruthAssertExpected] x');
  const other = row('C.java', 'SystemOut', "[SystemOut] x\n  Did you mean 'y'?");

  it('hands back nothing when javac warnings cannot fail the recompile', () => {
    const set = argumentSetOf(['--project-arg=-Xlint:none', '--sources', 'A.java', ''].join('\n'));

    expect(recompiledHandBacks(set, [suggested, plain, other])).toStrictEqual(new Map());
  });

  it('hands back the suggestions of recompiled checks when javac warnings decide them', () => {
    for (const argument of ['-Werror', '-Xlint:all', '-Xlint']) {
      const set = argumentSetOf([`--project-arg=${argument}`, '--sources', 'A.java', ''].join('\n'));

      expect(recompiledHandBacks(set, [suggested, plain, other])).toStrictEqual(
        new Map([['A.java', ['StaticMockMember']]]),
      );
    }
  });
});
