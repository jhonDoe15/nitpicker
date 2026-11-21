import { describe, expect, it } from 'vitest';
import { countInMessage, countPattern, withCountRatchets } from './count-ratchet.mts';

const RETURNS = countPattern('has {count} return statements', 'return statements').pattern;

type TestRatchet = {
  key: string;
  value: number;
  worseMessage: string;
  heldMessage: string;
  declarationKey?: string;
};

type TestFinding = {
  tool: string;
  rule: string;
  path: string;
  identity: string;
  message: string;
  classification: string;
  location: { line: number };
  ratchet?: TestRatchet;
  anchor?: { key: string };
};

function first<T>(items: readonly T[]): T {
  const [item] = items;
  if (item === undefined) {
    throw new Error('Expected a finding');
  }
  return item;
}

function ratchetOf(item: TestFinding): TestRatchet {
  if (item.ratchet === undefined) {
    throw new Error('Expected a ratchet');
  }
  return item.ratchet;
}

function anchorOf(item: TestFinding): { key: string } {
  if (item.anchor === undefined) {
    throw new Error('Expected an anchor');
  }
  return item.anchor;
}

function finding(message: string, line: number, extra: Partial<TestFinding> = {}): TestFinding {
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

function returnCount(
  item: TestFinding,
): { value: number; subject: string; unit: string } | undefined {
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
    const counted = first(
      withCountRatchets(
        [finding('Function f has 3 return statements.', 4)],
        returnCount,
        () => undefined,
      ),
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
    const counted = first(
      withCountRatchets(
        [finding(`Function f has 3 return statements. ${route}`, 4)],
        returnCount,
        () => undefined,
      ),
    );

    expect(ratchetOf(counted).heldMessage).not.toContain('If this is intended');
    expect(ratchetOf(counted).worseMessage.endsWith(route)).toBe(true);
  });

  it('keys a finding by the function around it, so a sibling never takes its place', () => {
    const counted = withCountRatchets(
      [finding('Cyclomatic complexity is 20.', 10), finding('Cyclomatic complexity is 11.', 40)],
      (item) => ({ value: 1, subject: item.message, unit: 'complexity' }),
      (item) => ({ name: item.location.line < 20 ? 'first' : 'second' }),
    );

    expect(counted.map((item) => ratchetOf(item).key.split(':in:').at(-1))).toEqual([
      'first',
      'second',
    ]);
    expect(counted.map(({ identity }) => identity.split('|')[1])).toEqual([
      'in:first',
      'in:second',
    ]);
  });

  it('gives a name-free anchor and a declaration key when the function text is known', () => {
    const counted = (name: string, declarationHash: string): TestFinding =>
      first(
        withCountRatchets(
          [finding(`Function ${name} has 3 return statements.`, 4)],
          returnCount,
          () => ({ name: `Owner.${name}`, anchorHash: 'body', declarationHash }),
        ),
      );
    const before = counted('pick', 'd1');
    const after = counted('choose', 'd2');

    expect(after.anchor).toEqual(before.anchor);
    expect(anchorOf(before).key.endsWith(':text:body')).toBe(true);
    expect(ratchetOf(before).declarationKey).toBe(`${ratchetOf(before).key}:declaration:d1`);
    expect(ratchetOf(after).key).not.toBe(ratchetOf(before).key);
  });

  it('keys the subject without the line numbers in it', () => {
    const at = (line: number): string =>
      ratchetOf(
        first(
          withCountRatchets(
            [finding(`The literal appears 4 times; first on line ${String(line)}`, 1)],
            () => ({
              value: 4,
              subject: `The literal appears # times; first on line ${String(line)}`,
              unit: 'repeats',
            }),
            () => undefined,
          ),
        ),
      ).key;

    expect(at(3)).toBe(at(17));
  });

  it('leaves alone a finding that already has a ratchet or has no count', () => {
    const ratcheted = finding('Function f has 3 return statements.', 1, {
      ratchet: { key: 'own', value: 3, worseMessage: '', heldMessage: '' },
    });
    const plain = finding('Something else.', 2);

    expect(withCountRatchets([ratcheted, plain], returnCount, () => undefined)).toEqual([
      ratcheted,
      plain,
    ]);
  });
});
