import { describe, expect, it } from 'vitest';
import { changeFindings, rows, source } from '../../test-support/reuse-project.mjs';

const RULE = 'sibling-copy-edit';
const TIME_LIMIT = { timeout: 5_000 };

function render({ seed, lines = 100, edited = false }) {
  const factor = (index) => {
    if (edited && index % 10 === 5) return 99;
    return (index * 7 + seed * 13) % 10 === 0 ? 3 : 2;
  };
  return source(
    'export function render(input: Record<string, number>): number {',
    '  let total = 0;',
    ...Array.from(
      { length: lines },
      (_, index) => `  total += input.field${String(index)} * ${String(factor(index))};`,
    ),
    '  return total;',
    '}',
  );
}

function project(count, build) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`src/f${String(index)}/render.ts`, build(index)]),
  );
}

function siblingRows(base, head) {
  return rows(changeFindings(base, head).filter(({ rule }) => rule === RULE));
}

describe('sibling-copy-edit on many large copies', () => {
  it('compares nothing when every copy is edited', TIME_LIMIT, () => {
    const base = project(30, (index) => render({ seed: index, lines: 120 }));
    const head = project(30, (index) => render({ seed: index, lines: 120, edited: true }));

    expect(siblingRows(base, head)).toEqual([]);
  });

  it('compares edited copies with the untouched ones only', TIME_LIMIT, () => {
    const base = project(30, (index) => render({ seed: index }));
    const head = project(30, (index) => render({ seed: index, edited: index < 8 }));

    expect(siblingRows(base, head).map(([, file]) => file)).toEqual(
      Array.from({ length: 8 }, (_, index) => `src/f${String(index)}/render.ts`).toSorted(),
    );
  });

  it('compares large copies with scattered edits', TIME_LIMIT, () => {
    const base = project(2, (index) => render({ seed: index, lines: 400 }));
    const head = { ...base, 'src/f0/render.ts': render({ seed: 0, lines: 400, edited: true }) };

    expect(siblingRows(base, head).map(([, file]) => file)).toEqual(['src/f0/render.ts']);
  });

  it('skips a pair whose differing middle is too big to compare', TIME_LIMIT, () => {
    const base = project(2, (index) => render({ seed: index, lines: 1500 }));
    const head = { ...base, 'src/f0/render.ts': render({ seed: 0, lines: 1500, edited: true }) };

    expect(siblingRows(base, head)).toEqual([]);
  });
});

describe('sibling-copy-edit on many small copies', () => {
  const handler = (limit) =>
    source(
      'export function handler(input: number[], limit: number): number {',
      '  const kept = input.filter((value) => value < limit);',
      `  return kept.length > ${String(limit)} ? kept.length : 0;`,
      '}',
    );

  it('compares a few edited copies with hundreds of untouched ones', TIME_LIMIT, () => {
    const base = project(150, () => handler(3));
    const head = { ...base, ...project(4, () => handler(4)) };

    expect(siblingRows(base, head).map(([, file]) => file)).toEqual(
      Array.from({ length: 4 }, (_, index) => `src/f${String(index)}/render.ts`),
    );
  });
});
