import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { mainOperandSlips, testOperandSlips } from './operand-slips.mjs';

const COPY = 'One side was probably copied: fix the operand that was meant to differ.';
const IMPOSSIBLE =
  'These comparisons of one value cannot both hold, so this `&&` is always false. Fix the constant or operator that was copied.';
const ALWAYS =
  'Together these comparisons of one value always hold, so this `||` is always true. Fix the constant or operator that was copied.';

function inFunction(body) {
  return `fun check(a: Int, b: Int, x: Double, s: String, t: Int): Any {\n    ${body}\n}\n`;
}

function found(source, rule = mainOperandSlips) {
  const scanned = scanKotlinSource(source);
  return rule(scanned)
    .toSorted((left, right) => left.offset - right.offset)
    .map((reported) => [lineOf(scanned, reported.offset), reported.message]);
}

function both(operand, operator) {
  return `\`${operand}\` is on both sides of \`${operator}\`. ${COPY}`;
}

function twice(operand, operator) {
  return `\`${operand}\` appears twice in this \`${operator}\` chain. ${COPY}`;
}

function implied(redundant, deciding) {
  return `\`${redundant}\` already follows from \`${deciding}\`, so it checks nothing. Remove it, or fix its constant or operator.`;
}

function covered(redundant, deciding) {
  return `\`${redundant}\` adds nothing: \`${deciding}\` holds whenever it does. Remove it, or fix its constant or operator.`;
}

function erases(operator, operand) {
  return `\`${operator} 0\` erases \`${operand}\`: the result is 0 whatever it holds (or -0.0 or NaN for a \`Double\`). Write the value meant, or fix the operand.`;
}

function reapplied(target, operator) {
  return `\`${target} ${operator}=\` already applies \`${target}\`, and the right side uses it again. Drop \`${target}\` from the right side, or write \`${target} = ...\` with the whole expression.`;
}

describe('mainOperandSlips', () => {
  it.each([
    ['a subtraction', 'return a - a', [both('a', '-')]],
    ['an order comparison', 'return a.size <= a.size', [both('a.size', '<=')]],
    ['a remainder in a call argument', 'return listOf(b, t % t)', [both('t', '%')]],
    ['an identity comparison', 'return s === s', [both('s', '===')]],
    ['an infix and', 'return a and a', [both('a', 'and')]],
    ['a parenthesized side', 'return (a + b) - (a+b)', [both('a + b', '-')]],
    ['a safe call chain', 'return s?.length == s?.length', [both('s?.length', '==')]],
    [
      'an equality of one name',
      'return x != x',
      [`\`x\` is compared with itself. To test for NaN, write \`x.isNaN()\`. ${COPY}`],
    ],
    ['a lambda body', 'return listOf(a).map { it - it }', [both('it', '-')]],
    ['an if condition', 'if (a > a) return 1\n    return 0', [both('a', '>')]],
    ['a class literal', 'return a::class == a::class', [both('a::class', '==')]],
  ])('reports the same operand on both sides: %s', (_, body, messages) => {
    expect(found(inFunction(body))).toEqual(messages.map((message) => [2, message]));
  });

  it.each([
    ['different operands', 'return a - b'],
    ['a call on both sides', 'return next() - next()'],
    ['an increment', 'return t++ - t++'],
    ['a lambda argument', 'return run { a } - run { a }'],
    ['string templates', 'return "$a" == "$a"'],
    ['a literal on both sides', 'return 1 - 1'],
    ['an addition', 'return a + a'],
    ['text inside a string', 'return "a - a"'],
    ['text inside a comment', 'return b // a - a'],
    ['two statements on two lines', 'val c = a\n    -a\n    return c'],
    ['a generic call', 'return listOf<Int>(a) == listOf<Int>(a)'],
  ])('leaves %s alone', (_, body) => {
    expect(found(inFunction(body))).toEqual([]);
  });

  it.each([
    ['an && chain', 'return a > 0 && b > 0 && a > 0', [twice('a > 0', '&&')]],
    ['a mirrored comparison', 'return a < b || b > a', [twice('b > a', '||')]],
    [
      'a nested group',
      'return (s.isEmpty() && a > 1) || (b > 1 || a == b) || b == a',
      [twice('b == a', '||')],
    ],
    ['a chain over lines', 'return a > 0 &&\n        a > 0', [twice('a > 0', '&&')]],
    [
      'a chain continued on the next line',
      'return a > 0\n        && a > 0',
      [twice('a > 0', '&&')],
    ],
  ])('reports an operand repeated in %s', (_, body, messages) => {
    expect(found(inFunction(body))).toEqual(messages.map((message) => [2, message]));
  });

  it('does not compare operands across a call that may change state', () => {
    expect(found(inFunction('return a > 0 && advance() && a > 0'))).toEqual([]);
  });

  it.each([
    ['contradicting bounds', 'return a < 3 && a > 5', [IMPOSSIBLE]],
    ['two different equalities', 'return s == "x" && s == "y"', [IMPOSSIBLE]],
    ['inequalities that cover everything', 'return a != 1 || a != 2', [ALWAYS]],
    ['an implied bound', 'return a > 5 && a > 3', [implied('a > 3', 'a > 5')]],
    ['a covered equality', 'return a == 1 || a >= 1', [covered('a == 1', 'a >= 1')]],
    ['a constant on the left', 'return 3 > a && a > 5', [IMPOSSIBLE]],
    ['a negative constant', 'return a < -2 && a > -1', [IMPOSSIBLE]],
  ])('reports %s', (_, body, messages) => {
    expect(found(inFunction(body))).toEqual(messages.map((message) => [2, message]));
  });

  it.each([
    ['bounds that may both hold', 'return a > 3 && a < 5'],
    ['a value that may be NaN', 'return x < 5 || x >= 5'],
    ['equalities with different literal types', 'return t == 5 || t != 5L'],
    ['a Float constant', 'return x > 0.5f && x > 0.25f'],
    ['different operands', 'return a < 3 && b > 5'],
  ])('leaves %s alone', (_, body) => {
    expect(found(inFunction(body))).toEqual([]);
  });

  it.each([
    ['x * 0', 'return x * 0', [erases('*', 'x')]],
    ['0 * a member', 'return 0 * a.size', [erases('*', 'a.size')]],
    ['a sum times 0L', 'return (a + b) * 0L', [erases('*', '(a + b)')]],
    ['and 0', 'return a and 0', [erases('and', 'a')]],
  ])('reports an operand erased by %s', (_, body, messages) => {
    expect(found(inFunction(body))).toEqual(messages.map((message) => [2, message]));
  });

  it.each([
    ['a constant times 0', 'return 5 * 0'],
    ['a call times 0', 'return next() * 0'],
  ])('leaves %s alone', (_, body) => {
    expect(found(inFunction(body))).toEqual([]);
  });

  it.each([
    ['a += a + b', 'var c = a\n    c += c + b\n    return c', [3, reapplied('c', '+')]],
    ['a += b + a', 'var c = a\n    c += b + c\n    return c', [3, reapplied('c', '+')]],
    ['a -= a - b', 'var c = a\n    c -= c - b\n    return c', [3, reapplied('c', '-')]],
    ['a *= a * b', 'var c = a\n    c *= (c * b)\n    return c', [3, reapplied('c', '*')]],
  ])('reports a compound assignment that repeats its target: %s', (_, body, report) => {
    expect(found(inFunction(body))).toEqual([report]);
  });

  it.each([
    ['a -= b - a', 'var c = a\n    c -= b - c\n    return c'],
    ['a += a * b', 'var c = a\n    c += c * b\n    return c'],
    ['a += b', 'var c = a\n    c += b\n    return c'],
  ])('leaves %s alone', (_, body) => {
    expect(found(inFunction(body))).toEqual([]);
  });
});

describe('testOperandSlips', () => {
  it('lets a test apply an operator to one value twice or to 0', () => {
    const source = inFunction(
      'assertEquals(zero, money - money)\n    assertTrue(money == money)\n    return money * 0',
    );
    expect(found(source, testOperandSlips)).toEqual([]);
  });

  it('still reports repeated chain operands and contradicting constants in tests', () => {
    const source = inFunction('assertTrue(a > 0 && a > 0)\n    return a < 3 && a > 5');
    expect(found(source, testOperandSlips)).toEqual([
      [2, twice('a > 0', '&&')],
      [3, IMPOSSIBLE],
    ]);
  });
});
