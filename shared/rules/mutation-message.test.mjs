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
      'Survived StringLiteral: replacing this code with `"Stryker was here!"` fails no test. Add an assertion that would.',
    );
  });

  it('asks for an assertion when the adapter gives no replacement', () => {
    expect(mutantMessage({ status: 'Survived', label: 'NegateConditionals' })).toBe(
      'Survived NegateConditionals: no test fails when this code changes. Add an assertion that would.',
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
});
