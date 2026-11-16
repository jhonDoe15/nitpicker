import { describe, expect, it } from 'vitest';
import { counterexample, decide } from '../decide.mjs';
import { and, binary, not, or } from '../test-support/build.mjs';
import {
  absolute,
  arithmetic,
  cast,
  constant,
  equal,
  negated,
  variable,
} from '../test-support/typed.mjs';

const INT_MIN = negated(constant(2147483648));
const INT_MAX = constant(2147483647);
const LONG_MIN = negated(constant('9223372036854775808', 'long'), 'long');
const LONG_MAX = constant('9223372036854775807', 'long');

function int(value) {
  return value < 0 ? negated(constant(-value)) : constant(value);
}

function long(value) {
  return constant(value, 'long');
}

async function holds(claim) {
  return decide([], claim);
}

describe('int arithmetic follows Java', () => {
  it.each([
    ['MAX_VALUE + 1 is MIN_VALUE', equal(arithmetic('+', INT_MAX, int(1)), INT_MIN)],
    ['MIN_VALUE - 1 is MAX_VALUE', equal(arithmetic('-', INT_MIN, int(1)), INT_MAX)],
    ['MIN_VALUE * -1 is MIN_VALUE', equal(arithmetic('*', INT_MIN, int(-1)), INT_MIN)],
    ['46341 * 46341 is negative', binary('<', arithmetic('*', int(46341), int(46341)), int(0))],
    ['-MIN_VALUE is MIN_VALUE', equal(negated(INT_MIN), INT_MIN)],
    ['abs(MIN_VALUE) is MIN_VALUE', equal(absolute(INT_MIN), INT_MIN)],
    ['abs(-5) is 5', equal(absolute(int(-5)), int(5))],
    ['-7 / 2 is -3', equal(arithmetic('/', int(-7), int(2)), int(-3))],
    ['-7 % 2 is -1', equal(arithmetic('%', int(-7), int(2)), int(-1))],
    ['7 / -2 is -3', equal(arithmetic('/', int(7), int(-2)), int(-3))],
    ['7 % -2 is 1', equal(arithmetic('%', int(7), int(-2)), int(1))],
    ['-7 % -2 is -1', equal(arithmetic('%', int(-7), int(-2)), int(-1))],
    ['MIN_VALUE / -1 is MIN_VALUE', equal(arithmetic('/', INT_MIN, int(-1)), INT_MIN)],
    ['MIN_VALUE % -1 is 0', equal(arithmetic('%', INT_MIN, int(-1)), int(0))],
    ['5 & 3 is 1', equal(arithmetic('&', int(5), int(3)), int(1))],
    ['5 | 3 is 7', equal(arithmetic('|', int(5), int(3)), int(7))],
    ['5 ^ 3 is 6', equal(arithmetic('^', int(5), int(3)), int(6))],
    ['~5 is -6', equal(negated(int(5), 'int', '~'), int(-6))],
  ])('%s', async (_name, claim) => {
    await expect(holds(claim)).resolves.toBe('true');
  });

  it.each([
    ['1 << 32 is 1', arithmetic('<<', int(1), int(32)), int(1)],
    ['1 << 31 is MIN_VALUE', arithmetic('<<', int(1), int(31)), INT_MIN],
    ['1 << 33 is 2', arithmetic('<<', int(1), int(33)), int(2)],
    ['1 << -1 is MIN_VALUE', arithmetic('<<', int(1), int(-1)), INT_MIN],
    ['-1 >>> 28 is 15', arithmetic('>>>', int(-1), int(28)), int(15)],
    ['-1 >>> 32 is -1', arithmetic('>>>', int(-1), int(32)), int(-1)],
    ['-16 >> 2 is -4', arithmetic('>>', int(-16), int(2)), int(-4)],
    ['-16 >> 34 is -4', arithmetic('>>', int(-16), int(34)), int(-4)],
    ['-1 >>> 31 is 1', arithmetic('>>>', int(-1), int(31)), int(1)],
  ])('shifts: %s', async (_name, shifted, expected) => {
    await expect(holds(equal(shifted, expected))).resolves.toBe('true');
  });
});

describe('long arithmetic follows Java', () => {
  it.each([
    ['MAX_VALUE + 1 is MIN_VALUE', equal(arithmetic('+', LONG_MAX, long(1), 'long'), LONG_MIN)],
    ['MIN_VALUE - 1 is MAX_VALUE', equal(arithmetic('-', LONG_MIN, long(1), 'long'), LONG_MAX)],
    [
      '3037000500L squared is negative',
      binary('<', arithmetic('*', long(3037000500), long(3037000500), 'long'), long(0)),
    ],
    ['int + long is long', equal(arithmetic('+', INT_MAX, long(1), 'long'), long(2147483648))],
    [
      '-7L / 2L is -3',
      equal(arithmetic('/', negated(long(7), 'long'), long(2), 'long'), negated(long(3), 'long')),
    ],
    ['1L << 64 is 1', equal(arithmetic('<<', long(1), int(64), 'long'), long(1))],
    ['1L << 63 is MIN_VALUE', equal(arithmetic('<<', long(1), int(63), 'long'), LONG_MIN)],
    [
      '-1L >>> 60 is 15',
      equal(arithmetic('>>>', negated(long(1), 'long'), long(60), 'long'), long(15)),
    ],
    [
      'an int shifted by a long count masks it by 31',
      equal(arithmetic('<<', int(1), long(33)), int(2)),
    ],
  ])('%s', async (_name, claim) => {
    await expect(holds(claim)).resolves.toBe('true');
  });
});

describe('narrow types are promoted to int and casts wrap', () => {
  const byteValue = variable('b', 'byte');
  const charValue = variable('c', 'char');
  const shortValue = variable('s', 'short');

  it.each([
    ['(byte) 200 is -56', equal(cast(int(200), 'byte'), int(-56))],
    ['(short) 40000 is -25536', equal(cast(int(40000), 'short'), int(-25536))],
    ['(char) -1 is 65535', equal(cast(int(-1), 'char'), int(65535))],
    ['(int) 3000000000L is -1294967296', equal(cast(long(3000000000), 'int'), int(-1294967296))],
    ['(long) -1 is -1L', equal(cast(int(-1), 'long'), negated(long(1), 'long'))],
    [
      '(byte) 128 + (byte) 128 is -256',
      equal(arithmetic('+', cast(int(128), 'byte'), cast(int(128), 'byte')), int(-256)),
    ],
  ])('%s', async (_name, claim) => {
    await expect(holds(claim)).resolves.toBe('true');
  });

  it('adds byte values as int without wrapping', async () => {
    const claim = binary('>', arithmetic('+', byteValue, int(1)), int(0));
    const facts = [equal(byteValue, int(127))];

    await expect(decide(facts, claim)).resolves.toBe('true');
    await expect(decide([], claim)).resolves.toBe('open');
  });

  it('keeps a char unsigned and a short signed', async () => {
    await expect(decide([], binary('>=', charValue, int(0)))).resolves.toBe('true');
    await expect(decide([], binary('>=', shortValue, int(0)))).resolves.toBe('open');
    await expect(decide([], binary('<=', charValue, int(65535)))).resolves.toBe('true');
    await expect(decide([], binary('<=', byteValue, int(127)))).resolves.toBe('true');
  });
});

describe('deciding conditions that contain arithmetic', () => {
  const n = variable('n');
  const guard = and(binary('>', n, int(0)), binary('<', n, int(100)));

  it('proves a sum that cannot overflow in its guarded range', async () => {
    await expect(decide([guard], binary('>', arithmetic('+', n, int(1)), int(0)))).resolves.toBe(
      'true',
    );
  });

  it('leaves the sum open when the range reaches MAX_VALUE', async () => {
    const wide = binary('>', n, int(0));

    await expect(decide([wide], binary('>', arithmetic('+', n, int(1)), int(0)))).resolves.toBe(
      'open',
    );
  });

  it('decides a long product that cannot overflow in its guarded range', async () => {
    const big = variable('big', 'long');
    const range = and(binary('>', big, long(0)), binary('<', big, long(1000000)));
    const query = binary('<', arithmetic('*', big, big, 'long'), long(1000000000000));

    await expect(decide([range], query)).resolves.toBe('true');
  });

  it('knows that x % 2 is -1 or 0 or 1 and never 2', async () => {
    const remainder = arithmetic('%', variable('x'), int(2));

    await expect(holds(or(equal(remainder, int(2)), binary('<', remainder, int(2))))).resolves.toBe(
      'true',
    );
    await expect(holds(not(equal(remainder, int(2))))).resolves.toBe('true');
  });
});

describe('counterexamples for fixed-width values', () => {
  it('names the inputs where a difference disagrees with the comparison', async () => {
    const a = variable('a');
    const b = variable('b');
    const same = or(
      and(binary('>', arithmetic('-', a, b), int(0)), binary('>', a, b)),
      and(not(binary('>', arithmetic('-', a, b), int(0))), not(binary('>', a, b))),
    );
    const found = await counterexample([], same, { nonZeroDivisors: true });

    expect(found).toMatch(/^name:"a" = -?\d+, name:"b" = -?\d+$/u);
  });

  it('has none when the difference cannot overflow', async () => {
    const a = variable('a');
    const b = variable('b');
    const small = and(
      and(binary('>=', a, int(0)), binary('>=', b, int(0))),
      and(binary('<', a, int(1000)), binary('<', b, int(1000))),
    );
    const same = or(
      and(binary('>', arithmetic('-', a, b), int(0)), binary('>', a, b)),
      and(not(binary('>', arithmetic('-', a, b), int(0))), not(binary('>', a, b))),
    );

    await expect(counterexample([small], same)).resolves.toBeUndefined();
  });
});
