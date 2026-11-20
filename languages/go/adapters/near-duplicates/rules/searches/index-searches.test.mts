import { describe, expect, it } from 'vitest';
import { decided } from '../../test-support/decided-lines.mts';

describe('decided-condition on Go index searches', () => {
  it('knows strings.Index and its relatives return at least -1', () => {
    expect(
      decided(
        'func f(s string, b []byte) bool {',
        '\tif strings.Index(s, "a") < -1 {',
        '\t\treturn true',
        '\t}',
        '\tif strings.LastIndexByte(s, 0) < -1 {',
        '\t\treturn true',
        '\t}',
        '\tif bytes.Index(b, b) < -1 {',
        '\t\treturn true',
        '\t}',
        '\treturn false',
        '}',
      ),
    ).toEqual([
      '4: `strings.Index(s, "a") < -1` is always false here: an index search returns -1 or a position, so the code it guards never runs',
      '7: `strings.LastIndexByte(s, 0) < -1` is always false here: an index search returns -1 or a position, so the code it guards never runs',
      '10: `bytes.Index(b, b) < -1` is always false here: an index search returns -1 or a position, so the code it guards never runs',
    ]);
  });

  it('gives a method called Index on a local value no fact', () => {
    expect(
      decided(
        'func f(strings finder) bool {',
        '\tif strings.Index("a") < -1 {',
        '\t\treturn true',
        '\t}',
        '\treturn false',
        '}',
      ),
    ).toEqual([]);
  });
});
