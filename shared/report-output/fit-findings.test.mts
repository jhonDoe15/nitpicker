import { describe, expect, it } from 'vitest';
import { fitFindings, outputLimitBytes, outputLimitMessage } from './fit-findings.mts';

function finding(rule: string, index: number, classification = 'enforceable') {
  return { tool: 'pmd', rule, path: `src/F${String(index)}.java`, classification };
}

function many(rule: string, count: number) {
  return Array.from({ length: count }, (_, index) => finding(rule, index));
}

const SIZE = Buffer.byteLength(JSON.stringify(finding('Wide', 0))) + 1;

describe('findings fitted to an analyzer output limit', () => {
  it('keeps every finding that fits', () => {
    const findings = many('Wide', 3);

    expect(fitFindings(findings, 3 * SIZE)).toEqual({ findings, cut: [] });
  });

  it('leaves out whole rules, largest first, until the rest fits', () => {
    const findings = [...many('Wide', 5), ...many('Mid1', 3), ...many('Thin', 1)];

    const fitted = fitFindings(findings, 5 * SIZE);

    expect(fitted.cut).toEqual([{ rule: 'pmd/Wide', findings: 5 }]);
    expect(fitted.findings).toEqual([...many('Mid1', 3), ...many('Thin', 1)]);
    expect(fitFindings(findings, 2 * SIZE).cut.map(({ rule }) => rule)).toEqual([
      'pmd/Wide',
      'pmd/Mid1',
    ]);
  });

  it('never leaves out a tool error', () => {
    const errors = [finding('Wide', 0, 'tool-error'), finding('Wide', 1, 'tool-error')];

    expect(fitFindings([...errors, ...many('Wide', 2)], SIZE)).toEqual({
      findings: errors,
      cut: [{ rule: 'pmd/Wide', findings: 2 }],
    });
  });

  it('reads the limit the run passes and ignores anything else', () => {
    expect(outputLimitBytes({ NITPICKER_ANALYZER_OUTPUT_LIMIT_BYTES: '1048576' })).toBe(1_048_576);
    expect(outputLimitBytes({ NITPICKER_ANALYZER_OUTPUT_LIMIT_BYTES: '1e6' })).toBeUndefined();
    expect(outputLimitBytes({})).toBeUndefined();
  });

  it('names the rules that were left out', () => {
    expect(
      outputLimitMessage(
        'java',
        [
          { rule: 'pmd/Wide', findings: 5 },
          { rule: 'pmd/Mid1', findings: 3 },
        ],
        384 * 1024 * 1024,
      ),
    ).toBe(
      'The java analyzer found more than the 384 MB its output holds, so the 8 findings of its largest rules ' +
        'were left out and the rest is reported: pmd/Wide (5), pmd/Mid1 (3). Exclude generated or vendored ' +
        'code, or gate the project in smaller parts, to see them',
    );
  });
});
