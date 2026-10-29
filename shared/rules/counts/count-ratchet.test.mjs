import { describe, expect, it } from 'vitest';
import { countInMessage, countPattern, withCountRatchets } from './count-ratchet.mjs';

const RETURNS = countPattern('has {count} return statements', 'return statements').pattern;

function finding(message, line, extra = {}) {
  return {
    tool: 'lint',
    rule: 'returns',
    path: 'src/a.kt',
    identity: `fp:${message}`,
    message,
    classification: 'enforceable',
    location: { line },
    ...extra,
  };
}

function returnCount(item) {
  const count = countInMessage(item.message, RETURNS);
  return count === undefined ? undefined : { ...count, unit: 'return statements' };
}

describe('countInMessage', () => {
  it('reads the count and leaves the rest of the message as the subject', () => {
    expect(countInMessage('Function f has 12 return statements, limit 2.', RETURNS)).toEqual({
      value: 12,
      subject: 'Function f has # return statements, limit 2.',
    });
  });

  it('reads a count printed with grouping commas', () => {
    const npath = countPattern(String.raw`NPath Complexity is {count} \(`, 'NPath').pattern;

    expect(countInMessage('NPath Complexity is 1,234,567 (max allowed is 200).', npath)).toEqual({
      value: 1_234_567,
      subject: 'NPath Complexity is # (max allowed is 200).',
    });
  });

  it('gives nothing for a message without the count', () => {
    expect(countInMessage('Function f is fine.', RETURNS)).toBeUndefined();
  });
});

describe('withCountRatchets', () => {
  it('puts the count in the identity and holds the finding by its subject', () => {
    const [counted] = withCountRatchets(
      [finding('Function f has 3 return statements.', 4)],
      returnCount,
    );

    expect(counted.identity).toBe('fp:Function f has 3 return statements.|in:|value:3');
    expect(counted.ratchet).toEqual({
      key: 'count:return statements:Function f has # return statements.:in:',
      value: 3,
      worseMessage:
        'Return statements grew from {base} to 3. Put the new code in a new function. Function f has 3 return statements.',
      heldMessage:
        'Function f has 3 return statements. Allowed at 3 return statements because base was {base}; any increase fails.',
    });
  });

  it('leaves the exception sentence out of the held note', () => {
    const route =
      'If this is intended, add {"rule":"returns","paths":["src/a.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.';
    const [counted] = withCountRatchets(
      [finding(`Function f has 3 return statements. ${route}`, 4)],
      returnCount,
    );

    expect(counted.ratchet.heldMessage).not.toContain('If this is intended');
    expect(counted.ratchet.worseMessage.endsWith(route)).toBe(true);
  });

  it('keys a finding by the function around it, so a sibling never takes its place', () => {
    const counted = withCountRatchets(
      [finding('Cyclomatic complexity is 20.', 10), finding('Cyclomatic complexity is 11.', 40)],
      (item) => ({ value: 1, subject: item.message, unit: 'complexity' }),
      (item) => (item.location.line < 20 ? 'first' : 'second'),
    );

    expect(counted.map(({ ratchet }) => ratchet.key.split(':in:').at(-1))).toEqual([
      'first',
      'second',
    ]);
    expect(counted.map(({ identity }) => identity.split('|')[1])).toEqual([
      'in:first',
      'in:second',
    ]);
  });

  it('keys the subject without the line numbers in it', () => {
    const at = (line) =>
      withCountRatchets(
        [finding(`The literal appears 4 times; first on line ${String(line)}`, 1)],
        () => ({
          value: 4,
          subject: `The literal appears # times; first on line ${String(line)}`,
          unit: 'repeats',
        }),
      )[0].ratchet.key;

    expect(at(3)).toBe(at(17));
  });

  it('leaves alone a finding that already has a ratchet or has no count', () => {
    const ratcheted = finding('Function f has 3 return statements.', 1, {
      ratchet: { key: 'own', value: 3 },
    });
    const plain = finding('Something else.', 2);

    expect(withCountRatchets([ratcheted, plain], returnCount)).toEqual([ratcheted, plain]);
  });
});
