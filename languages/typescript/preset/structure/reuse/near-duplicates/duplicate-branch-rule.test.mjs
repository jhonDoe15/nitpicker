import { describe, expect, it } from 'vitest';
import { findingsOf, source } from '../../test-support/reuse-project.mjs';

function branches(files) {
  return findingsOf(files)
    .filter(({ rule }) => rule === 'duplicate-branch')
    .map(({ path, location, classification, message }) => [
      path,
      location.line,
      classification,
      message.split(' If ')[0],
    ])
    .toSorted((left, right) => left[1] - right[1]);
}

describe('duplicate-branch on TypeScript and JavaScript', () => {
  it('reports equal arms of an if chain, a ternary and a switch, not arms that differ in a literal', () => {
    const file = 'src/pricing/discount.ts';
    const found = branches({
      [file]: source(
        'export function discount(total: number, member: boolean, coupon: boolean): number {',
        '  if (member) {',
        '    const cut = total * 0.9;',
        '    return Math.round(cut);',
        '  } else if (coupon) {',
        '    const reduced = total * 0.9;',
        '    return Math.round(reduced);',
        '  } else if (total > 100) {',
        '    const reduced = total * 0.8;',
        '    return Math.round(reduced);',
        '  }',
        '  return total;',
        '}',
        '',
        'export function tier(total: number): string {',
        "  const label = total > 10 ? 'big' : 'big';",
        '  switch (total) {',
        '    case 1:',
        '      return label + total;',
        '    case 2:',
        '      return label + total;',
        '    default:',
        "      return 'none';",
        '  }',
        '}',
      ),
    });

    expect(found).toEqual([
      [
        file,
        5,
        'enforceable',
        'The arms for `member` (line 2) and `coupon` (line 5) have the same body. Merge them into one arm, or change the arm that was meant to differ.',
      ],
      [
        file,
        16,
        'enforceable',
        'Both branches of the ternary on line 16 are the same. Use the value without the ternary, or change the branch that was meant to differ.',
      ],
      [
        file,
        20,
        'enforceable',
        'The cases on lines 18 and 20 have the same body. Merge their labels into one case, or change the case that was meant to differ.',
      ],
    ]);
  });

  it('reports, as report-only, the statement every arm ends with', () => {
    const file = 'src/shapes/move.js';
    const found = branches({
      [file]: source(
        'export function move(shape, side, step) {',
        "  if (side === 'left') {",
        '    shape.x -= step;',
        '    shape.dirty = true;',
        '  } else {',
        '    shape.x += step;',
        '    shape.dirty = true;',
        '  }',
        '  return shape;',
        '}',
      ),
    });

    expect(found).toEqual([
      [
        file,
        2,
        'descriptive',
        'Every arm of the `if` on line 2 ends with the same statement. Move it after the `if`.',
      ],
    ]);
  });
});
