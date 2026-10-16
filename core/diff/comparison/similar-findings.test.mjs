import { describe, expect, it } from 'vitest';
import { compareFindings } from './compare.mjs';

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
      compare([finding('b', 'Error: boom abcdef')], [finding('h', 'Error: boom ghijkl')]),
    ).toEqual({
      added: [],
      kept: ['h'],
      resolved: [],
    });
  });

  it('reports a finding when two tokens differ', () => {
    expect(
      compare([finding('b', 'Error: boom abcdef')], [finding('h', 'Warn: boom ghijkl')]),
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
    expect(compare([finding('b', 'boom abcdef')], [finding('h', 'boom ghijkl')]).added).toEqual([
      'h',
    ]);
  });

  it('matches one base finding to one head finding only', () => {
    const result = compare(
      [finding('b', 'Error: boom abcdef')],
      [finding('h1', 'Error: boom ghijkl'), finding('h2', 'Error: boom mnopqr')],
    );

    expect(result.added).toHaveLength(1);
    expect(result.kept).toHaveLength(1);
  });

  it('matches only within the same tool, rule and path', () => {
    const base = [finding('b', 'Error: boom abcdef')];

    expect(
      compare(base, [finding('h', 'Error: boom ghijkl', { path: 'test/b.test.ts' })]).added,
    ).toEqual(['h']);
    expect(compare(base, [finding('h', 'Error: boom ghijkl', { rule: 'other' })]).added).toEqual([
      'h',
    ]);
  });

  it('follows a renamed file', () => {
    const renames = new Map([['test/a.test.ts', 'test/c.test.ts']]);
    const head = finding('h', 'Error: boom ghijkl', { path: 'test/c.test.ts' });

    expect(compare([finding('b', 'Error: boom abcdef')], [head], renames).added).toEqual([]);
  });

  it('ignores a finding without tokens', () => {
    const [base, head] = [finding('b', 'Error: boom abcdef'), finding('h', 'Error: boom ghijkl')];

    expect(compare([base], [{ ...head, tokens: undefined }]).added).toEqual(['h']);
  });
});
