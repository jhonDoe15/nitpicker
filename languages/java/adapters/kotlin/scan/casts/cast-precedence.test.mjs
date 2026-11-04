import { describe, expect, it } from 'vitest';
import { withoutCoveredCasts } from './cast-precedence.mjs';

const at = (tool, rule, line, file = 'A.kt') => ({ tool, rule, path: file, location: { line } });

describe('withoutCoveredCasts', () => {
  it('keeps the more specific detekt finding and drops the cast operator finding on its line', () => {
    const detekt = at('detekt', 'detekt.potential-bugs.CastToNullableType', 3);
    const covered = at('kotlin-source', 'UnsafeCastOperator', 3);
    const other = at('kotlin-source', 'UnsafeCastOperator', 4);
    const elsewhere = at('kotlin-source', 'UnsafeCastOperator', 3, 'B.kt');

    expect(withoutCoveredCasts([detekt, covered, other, elsewhere])).toEqual([
      detekt,
      other,
      elsewhere,
    ]);
  });

  it('also yields to the compiler warnings for an unchecked or useless cast', () => {
    const cast = at('kotlin-source', 'UnsafeCastOperator', 3);

    expect(withoutCoveredCasts([at('kotlinc', 'unchecked', 3), cast])).toHaveLength(1);
    expect(withoutCoveredCasts([at('kotlinc', 'cast', 3), cast])).toHaveLength(1);
  });

  it('leaves other findings on the line alone', () => {
    const detekt = at('detekt', 'detekt.style.UseLet', 3);
    const cast = at('kotlin-source', 'UnsafeCastOperator', 3);

    expect(withoutCoveredCasts([detekt, cast])).toEqual([detekt, cast]);
  });
});
