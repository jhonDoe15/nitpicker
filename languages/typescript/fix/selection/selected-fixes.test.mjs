import { describe, expect, it } from 'vitest';
import { selectedEslintRules, selectedOutput } from './selected-fixes.mjs';

const BOM = String.fromCodePoint(0xfeff);
const SOURCE = 'var a = 1;\nlet b = 2;\n';
const messages = [
  { ruleId: 'prefer-const', fix: { range: [11, 14], text: 'const' } },
  { ruleId: 'no-var', fix: { range: [0, 3], text: 'let' } },
  { ruleId: 'no-var', fix: { range: [2, 5], text: 'overlap' } },
  { ruleId: 'no-var' },
];

describe('selectedEslintRules', () => {
  it('keeps the ESLint rules of the selection without their tool prefix', () => {
    expect(
      selectedEslintRules([
        'eslint/no-var',
        'ruff/F401',
        'eslint/@scope/rule',
        'eslint-lint/eqeqeq',
      ]),
    ).toEqual(['no-var', '@scope/rule', 'eqeqeq']);
  });
});

describe('selectedOutput', () => {
  it('applies only the fixes of the named rules and skips an overlapping one', () => {
    expect(selectedOutput(SOURCE, messages, ['no-var']).text).toBe('let a = 1;\nlet b = 2;\n');
    expect(selectedOutput(SOURCE, messages, ['prefer-const']).text).toBe(
      'var a = 1;\nconst b = 2;\n',
    );
  });
  it('applies the fixes of several rules in order', () => {
    expect(selectedOutput(SOURCE, messages, ['prefer-const', 'no-var']).text).toBe(
      'let a = 1;\nconst b = 2;\n',
    );
  });
  it('gives nothing when no fix of the named rules exists', () => {
    expect(selectedOutput(SOURCE, messages, ['eqeqeq']).text).toBeUndefined();
  });
  it('keeps a byte order mark that ESLint does not count in its ranges', () => {
    expect(selectedOutput(`${BOM}${SOURCE}`, messages, ['no-var']).text).toBe(
      `${BOM}let a = 1;\nlet b = 2;\n`,
    );
  });
  it('applies the single suggestion of a named rule and reports it', () => {
    const suggested = [
      { ruleId: 'use-isnan', line: 1, suggestions: [{ fix: { range: [0, 3], text: 'let' } }] },
      { ruleId: 'no-var', line: 1, suggestions: [{ fix: { range: [4, 5], text: 'x' } }] },
      {
        ruleId: 'eqeqeq',
        line: 2,
        suggestions: [{ fix: { range: [0, 1], text: 'a' } }, { fix: { range: [0, 1], text: 'b' } }],
      },
    ];
    const result = selectedOutput(SOURCE, suggested, ['use-isnan', 'eqeqeq']);

    expect(result.text).toBe('let a = 1;\nlet b = 2;\n');
    expect(result.suggested).toEqual([{ rule: 'eslint-lint/use-isnan', line: 1 }]);
  });
});
