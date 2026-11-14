import { describe, expect, it } from 'vitest';
import { withRenderedPlaceholders } from './pmd-placeholders.mjs';

const SOURCE = [
  'class A {',
  '  String u(String x) { return x.replace("localhost", "127.0.0.1"); }',
  '  String v = "::1";',
  '  String w = "10.0.0.1" + "ok";',
  '}',
].join('\n');
const sourceText = (file) => (file === 'A.java' ? SOURCE : undefined);

function ip(line, column, message = `Do not hard code the IP address \${variableName}`) {
  return {
    tool: 'pmd',
    rule: 'AvoidUsingHardCodedIP',
    path: 'A.java',
    message,
    location: { line, column },
  };
}

const messages = (findings) =>
  withRenderedPlaceholders(findings, { sourceText }).map((f) => f.message);

describe('withRenderedPlaceholders', () => {
  it('names the literal that the finding points at', () => {
    expect(messages([ip(2, 49), ip(3, 14), ip(4, 14)])).toEqual([
      'Do not hard code the IP address "127.0.0.1"',
      'Do not hard code the IP address "::1"',
      'Do not hard code the IP address "10.0.0.1"',
    ]);
  });

  it('finds the address on the line when the column is off, and never takes a non-address literal', () => {
    expect(messages([ip(2, 1)])).toEqual(['Do not hard code the IP address "127.0.0.1"']);
    expect(messages([ip(2, 31)])).toEqual(['Do not hard code the IP address "127.0.0.1"']);
  });

  it('drops the clause when the source cannot be read', () => {
    expect(messages([{ ...ip(2, 49), path: 'Missing.java' }, ip(99, 1)])).toEqual([
      'Do not hard code the IP address',
      'Do not hard code the IP address',
    ]);
  });

  it('drops an unrendered placeholder of any other PMD message', () => {
    const other = {
      tool: 'pmd',
      rule: 'Other',
      path: 'A.java',
      message: `Bad value \${name} here`,
    };

    expect(messages([other])).toEqual(['Bad value here']);
  });

  it('leaves a rendered message and other tools alone', () => {
    const rendered = ip(3, 14, 'Do not hard code the IP address v');
    const checkstyle = { tool: 'checkstyle', rule: 'X', path: 'A.java', message: `literal \${x}` };

    expect(messages([rendered, checkstyle])).toEqual([rendered.message, checkstyle.message]);
  });
});
