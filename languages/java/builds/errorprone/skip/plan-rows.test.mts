import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../../shared/test-support/temp-projects.mts';
import { argumentSetOf } from '../engine-arguments.mts';
import { engineHandedBack, keptRows } from './plan-rows.mts';

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

describe('engineHandedBack', () => {
  const row = (file: string, rule: string, message: string) => ({ file, rule, line: 1, column: 1, message });
  const suggested = row('A.java', 'StaticMockMember', "[StaticMockMember] x\n  Did you mean 'Runnable a;'?");
  const plain = row('B.java', 'TruthAssertExpected', '[TruthAssertExpected] x');
  const other = row('C.java', 'SystemOut', "[SystemOut] x\n  Did you mean 'y'?");
  const report = {
    findings: [row('D.java', '_HandBack', 'MutableGuiceModule,TruthAssertExpected'), suggested, plain, other],
  };
  const others = new Map([['A.java', ['SystemOut']]]);

  it('hands back what the engine could not decide, and keeps the other hand-backs', () => {
    const set = argumentSetOf(['--project-arg=-Xlint:none', '--sources', 'A.java', ''].join('\n'));

    expect(engineHandedBack(report, set, [suggested, plain, other], others)).toStrictEqual(
      new Map([
        ['A.java', ['SystemOut']],
        ['D.java', ['MutableGuiceModule', 'TruthAssertExpected']],
      ]),
    );
  });

  it('hands back the suggestions of recompiled checks when javac warnings decide them', () => {
    for (const argument of ['-Werror', '-Xlint:all', '-Xlint']) {
      const set = argumentSetOf([`--project-arg=${argument}`, '--sources', 'A.java', ''].join('\n'));

      expect(engineHandedBack(report, set, [suggested, plain, other], new Map()).get('A.java')).toStrictEqual([
        'StaticMockMember',
      ]);
    }
  });
});
