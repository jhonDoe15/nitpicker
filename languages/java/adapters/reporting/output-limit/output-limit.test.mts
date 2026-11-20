import { describe, expect, it } from 'vitest';
import { withinOutputLimit } from './output-limit.mts';

function finding(rule: string, index: number) {
  return {
    tool: 'pmd',
    rule,
    path: `src/F${String(index)}.java`,
    identity: `${rule}:${String(index)}`,
    message: 'x'.repeat(900),
    classification: 'enforceable',
  };
}

function many(rule: string, count: number) {
  return Array.from({ length: count }, (_, index) => finding(rule, index));
}

const LIMIT = { NITPICKER_ANALYZER_OUTPUT_LIMIT_BYTES: String(128 * 1024) };

describe('a Java result larger than the analyzer output limit', () => {
  it('is passed on whole when it fits or no limit is given', () => {
    const snapshot = { findings: many('Wide', 200), imports: ['a'] };

    expect(withinOutputLimit(snapshot, 'java', {})).toBe(snapshot);
    expect(withinOutputLimit({ findings: many('Wide', 20) }, 'java', LIMIT).findings).toHaveLength(
      20,
    );
  });

  it('keeps the rules that fit and says which were left out', () => {
    const snapshot = { findings: [...many('Wide', 120), ...many('Thin', 30)], imports: ['a'] };

    const fitted = withinOutputLimit(snapshot, 'java', LIMIT);

    expect(fitted.imports).toEqual(['a']);
    expect(fitted.findings.slice(0, -1)).toEqual(many('Thin', 30));
    expect(fitted.findings.at(-1)).toEqual({
      tool: 'java',
      rule: 'output-limit',
      path: '.',
      identity: 'output-limit',
      message:
        'The java analyzer found more than the 0 MB its output holds, so the 120 findings of its largest rules ' +
        'were left out and the rest is reported: pmd/Wide (120). Exclude generated or vendored code, or gate ' +
        'the project in smaller parts, to see them',
      classification: 'tool-error',
    });
    expect(Buffer.byteLength(JSON.stringify(fitted))).toBeLessThan(128 * 1024);
  });
});
