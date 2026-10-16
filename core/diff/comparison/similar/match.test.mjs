import { describe, expect, it } from 'vitest';
import { compareFindings } from '../compare.mjs';

function finding(identity, message, overrides = {}) {
  return {
    tool: 'test-console',
    rule: 'test-console-output',
    path: 'test/a.test.ts',
    identity,
    message,
    classification: 'enforceable',
    tokens: message.split(' '),
    ...overrides,
  };
}

function compare(baseFindings, headFindings, baseToHeadRenames) {
  const result = compareFindings({ baseFindings, headFindings, baseToHeadRenames });
  return {
    added: result.newFindings.map(({ identity }) => identity),
    kept: result.unchangedFindings.map(({ identity }) => identity),
    resolved: result.resolvedFindings.map(({ identity }) => identity),
  };
}

describe('findings that match the base by tokens', () => {
  it('keeps a finding present when one token of three or more differs', () => {
    expect(
      compare([finding('b', 'Error: boom kqzmwa')], [finding('h', 'Error: boom xvbnrt')]),
    ).toEqual({
      added: [],
      kept: ['h'],
      resolved: [],
    });
  });

  it('reports a finding when two tokens differ', () => {
    expect(
      compare([finding('b', 'Error: boom kqzmwa')], [finding('h', 'Warn: boom xvbnrt')]),
    ).toEqual({
      added: ['h'],
      kept: [],
      resolved: ['b'],
    });
  });

  it('reports a finding whose token count differs', () => {
    expect(compare([finding('b', 'Error: boom')], [finding('h', 'Error: boom again')])).toEqual({
      added: ['h'],
      kept: [],
      resolved: ['b'],
    });
  });

  it('does not match fewer than three tokens', () => {
    expect(compare([finding('b', 'boom kqzmwa')], [finding('h', 'boom xvbnrt')]).added).toEqual([
      'h',
    ]);
  });

  it('matches one base finding to one head finding only', () => {
    const result = compare(
      [finding('b', 'Error: boom kqzmwa')],
      [finding('h1', 'Error: boom xvbnrt'), finding('h2', 'Error: boom zgcfdk')],
    );

    expect(result.added).toHaveLength(1);
    expect(result.kept).toHaveLength(1);
  });

  it('matches only within the same tool, rule and path', () => {
    const base = [finding('b', 'Error: boom kqzmwa')];

    expect(
      compare(base, [finding('h', 'Error: boom xvbnrt', { path: 'test/b.test.ts' })]).added,
    ).toEqual(['h']);
    expect(compare(base, [finding('h', 'Error: boom xvbnrt', { rule: 'other' })]).added).toEqual([
      'h',
    ]);
  });

  it('follows a renamed file', () => {
    const renames = new Map([['test/a.test.ts', 'test/c.test.ts']]);
    const head = finding('h', 'Error: boom xvbnrt', { path: 'test/c.test.ts' });

    expect(compare([finding('b', 'Error: boom kqzmwa')], [head], renames).added).toEqual([]);
  });

  it('ignores a finding without tokens', () => {
    const [base, head] = [finding('b', 'Error: boom kqzmwa'), finding('h', 'Error: boom xvbnrt')];

    expect(compare([base], [{ ...head, tokens: undefined }]).added).toEqual(['h']);
  });

  it('finds the best pairing whatever the order of the findings', () => {
    const base = [finding('b1', 'Error: kqzmwa zgcfdk'), finding('b2', 'Error: xvbnrt qwrtpl')];
    const head = [finding('h1', 'Error: kqzmwa qwrtpl'), finding('h2', 'Error: kqzmwa hjklmn')];

    expect(compare(base, head)).toEqual({ added: [], kept: ['h1', 'h2'], resolved: [] });
    expect(compare(base.toReversed(), head.toReversed())).toEqual({
      added: [],
      kept: ['h1', 'h2'],
      resolved: [],
    });
  });

  it('stays fast for thousands of different messages in one file', () => {
    const many = (prefix) =>
      Array.from({ length: 4000 }, (_, index) =>
        finding(
          `${prefix}${String(index)}`,
          `${prefix}${String(index)} ${String(index)}${prefix} one two three`,
        ),
      );
    const started = Date.now();

    expect(compare(many('base'), many('head')).added).toHaveLength(4000);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
