import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fieldOf, listOf } from '../../../../../../shared/values/readers.mts';
import { callUntyped, type JavaFinding } from '../../../typed/java-values.mts';
import { withoutRuntimeCryptoKeys } from './crypto-key-filter.mjs';

const SOURCE = readFileSync(new URL('./fixtures/Keys.java', import.meta.url), 'utf8');
function sourceText(): string {
  return SOURCE;
}
const lines = SOURCE.split('\n');

function at(marker: string, needle = '"'): JavaFinding {
  const line = lines.findIndex((row) => row.includes(`// ${marker}`)) + 1;
  const column = (lines[line - 1] ?? '').indexOf(needle) + 1;
  return {
    tool: 'pmd',
    rule: 'HardCodedCryptoKey',
    path: 'Keys.java',
    location: { line, column },
    marker,
  };
}

function without(
  found: readonly object[],
  reader: { readonly sourceText: (file: string) => string | undefined } = { sourceText },
): readonly unknown[] {
  return listOf(callUntyped(withoutRuntimeCryptoKeys, found, reader));
}

function kept(...markers: readonly string[]): unknown[] {
  return without(markers.map((marker) => at(marker))).map((finding) => fieldOf(finding, 'marker'));
}

describe('withoutRuntimeCryptoKeys', () => {
  it('drops a key built from a parameter, a field, a call or the environment', () => {
    expect(
      kept('param', 'inline', 'field', 'env', 'call', 'viaLocal', 'member', 'envConstant'),
    ).toEqual([]);
  });

  it('keeps a key made only of literals and constants', () => {
    const markers = [
      'literal',
      'constant',
      'bytes',
      'decoded',
      'localLiteral',
      'scoped',
      'thisField',
    ];

    expect(kept(...markers)).toEqual(markers);
  });

  it('keeps a hex byte array key, which is a literal', () => {
    const found = [at('hexInline', '0x01'), at('hexLocal', '0x1'), at('hexCast', '(byte)')];

    expect(without(found).map((finding) => fieldOf(finding, 'marker'))).toEqual([
      'hexInline',
      'hexLocal',
      'hexCast',
    ]);
  });

  it('keeps findings of other rules, other tools and unreadable sources', () => {
    const other = { ...at('param'), rule: 'Other' };
    const foreign = { ...at('param'), tool: 'spotbugs' };
    const unplaced = { tool: 'pmd', rule: 'HardCodedCryptoKey', path: 'Keys.java' };

    expect(without([other, foreign, unplaced])).toHaveLength(3);
    expect(without([at('param')], { sourceText: () => undefined })).toHaveLength(1);
  });
});
