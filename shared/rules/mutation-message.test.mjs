import { describe, expect, it } from 'vitest';
import { mutantMessage } from './mutation.mjs';

describe('mutantMessage', () => {
  it('shows the replacement that no test caught', () => {
    expect(
      mutantMessage({
        status: 'Survived',
        label: 'StringLiteral',
        replacement: '"Stryker was here!"',
      }),
    ).toBe(
      'Survived StringLiteral: replacing this code with `"Stryker was here!"` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
    );
  });

  it('asks for an assertion when the adapter gives no replacement', () => {
    expect(mutantMessage({ status: 'Survived', label: 'NegateConditionals' })).toBe(
      'Survived NegateConditionals: no test fails when this code changes. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
    );
  });

  it('says that no test reaches uncovered code', () => {
    expect(mutantMessage({ status: 'NoCoverage', label: 'BlockStatement' })).toBe(
      'NoCoverage BlockStatement: no test runs this code. Add a test that reaches it.',
    );
  });

  it('shortens a long replacement to one line', () => {
    const message = mutantMessage({
      status: 'Survived',
      label: 'BlockStatement',
      replacement: `{\n${'  x;\n'.repeat(40)}}`,
    });

    expect(message).toContain('`{ x; x;');
    expect(message).toContain('…`');
    expect(message).not.toContain('\n');
  });

  it('keeps the plain status for other mutants', () => {
    expect(mutantMessage({ status: 'Timeout', label: 'ConditionalExpression' })).toBe(
      'Timeout ConditionalExpression',
    );
  });

  it('shows an empty replacement as two quotes, not as empty backticks', () => {
    const message = mutantMessage({
      status: 'Survived',
      label: 'BlockStatement',
      replacement: ' ',
    });

    expect(message).toContain("with `''` (an empty string) fails no test");
    expect(message).not.toContain('``');
  });

  it('shows an emptied template literal as an empty string and keeps backticks readable', () => {
    const emptied = mutantMessage({
      status: 'Survived',
      label: 'StringLiteral',
      replacement: '``',
    });
    const template = mutantMessage({
      status: 'Survived',
      label: 'StringLiteral',
      replacement: '`${left}`',
    });

    expect(emptied).toContain("with `''` (an empty string) fails no test");
    expect(template).toContain('with `` `${left}` `` fails no test');
  });

  it('tells apart mutants of one kind by column and original code', () => {
    const first = mutantMessage({
      status: 'Survived',
      label: 'ConditionalExpression',
      column: 15,
      original: 'a > b',
      replacement: 'true',
    });
    const second = mutantMessage({
      status: 'Survived',
      label: 'ConditionalExpression',
      column: 28,
      original: 'a > b && c',
      replacement: 'false',
    });

    expect(first).toContain(
      'Survived ConditionalExpression at column 15: replacing `a > b` with `true` fails no test.',
    );
    expect(second).not.toBe(first);
  });
});
