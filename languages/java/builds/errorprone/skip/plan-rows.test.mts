import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../../shared/test-support/temp-projects.mts';
import { argumentSetOf } from '../engine-arguments.mts';
import { keptRows } from './plan-rows.mts';

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
