import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { simplerBooleanLogic } from './simpler-logic.mjs';

function found(source) {
  const scanned = scanKotlinSource(source);
  return simplerBooleanLogic(scanned).map((reported) => [
    lineOf(scanned, reported.offset),
    reported.message,
  ]);
}

function simpler(form, line = 1) {
  return [line, `Write this boolean logic in its simpler exact form: \`${form}\`.`];
}

function swapped(form, line = 1) {
  return [
    line,
    `Write this boolean logic in its simpler exact form: \`${form}\`, with the two branches swapped.`,
  ];
}

describe('simplerBooleanLogic', () => {
  it.each([
    [
      'an if returning true and false',
      'fun f(a: Int, b: Int): Boolean {\n    if (a < b) return true else return false\n}\n',
      [simpler('return a < b', 2)],
    ],
    [
      'an if returning false, then a return of true',
      'fun f(a: Int, b: Int): Boolean {\n    if (a == b) {\n        return false\n    }\n    return true\n}\n',
      [simpler('return a != b', 2)],
    ],
    [
      'an if returning false for a negated condition',
      'fun f(ready: Boolean): Boolean {\n    if (!ready) return false\n    return true\n}\n',
      [simpler('return ready', 2)],
    ],
    [
      'an if expression of true and false',
      'fun f(a: Boolean) = if (a) true else false\n',
      [simpler('a')],
    ],
    [
      'an if expression of false and true over a chain',
      'fun f(a: Int, b: Int) = if (a < b && b > 0) false else true\n',
      [simpler('!(a < b && b > 0)')],
    ],
    ['a negated equality', 'fun f(a: Int, b: Int) = !(a == b)\n', [simpler('a != b')]],
    ['a negated identity', 'fun f(a: Any, b: Any) = !(a !== b)\n', [simpler('a === b')]],
    [
      'a negated type check',
      'fun f(e: Exception) = !(e is IllegalStateException)\n',
      [simpler('e !is IllegalStateException')],
    ],
    ['a negated range check', 'fun f(n: Int) = !(n in 1..3)\n', [simpler('n !in 1..3')]],
    [
      'a negated if with an else block',
      'fun f(a: Boolean) {\n    if (!a) {\n        stop()\n    } else {\n        run()\n    }\n}\n',
      [swapped('if (a) { … } else { … }', 2)],
    ],
    [
      'a negated if expression',
      'fun f(a: List<Int>) = if (!a.isEmpty()) a.first() else 0\n',
      [swapped('if (a.isEmpty()) … else …')],
    ],
    [
      'an and of negations in a condition',
      'fun f(a: List<Int>) {\n    if (!a.isEmpty() && !a.contains(1)) {\n        run()\n    }\n}\n',
      [simpler('!(a.isEmpty() || a.contains(1))', 2)],
    ],
    [
      'an or of negations with a grouped and',
      'fun f(a: Boolean, b: Boolean, c: Boolean) = !a || !(b && c)\n',
      [simpler('!(a && b && c)')],
    ],
    [
      'a returned chain, printed with its strings',
      'fun f(a: String): Boolean {\n    return !a.startsWith("x") && !a.endsWith("y")\n}\n',
      [simpler('!(a.startsWith("x") || a.endsWith("y"))', 2)],
    ],
  ])('reports %s', (_name, source, expected) => {
    expect(found(source)).toEqual(expected);
  });

  it.each([
    ['an order comparison, which NaN keeps', 'fun f(a: Double, b: Double) = !(a < b)\n'],
    ['a negated chain', 'fun f(a: Boolean, b: Boolean) = !(a == b && b)\n'],
    [
      'an else if chain',
      'fun f(a: Boolean, b: Boolean) {\n    if (!a) {\n        x()\n    } else if (b) {\n        y()\n    }\n}\n',
    ],
    ['a negated if without an else', 'fun f(a: Boolean) {\n    if (!a) {\n        x()\n    }\n}\n'],
    [
      'a negation inside a chain',
      'fun f(a: Boolean, b: Boolean) {\n    if (!a && b) {\n        x()\n    } else {\n        y()\n    }\n}\n',
    ],
    ['a chain with an operand that is not negated', 'fun f(a: Boolean, b: Boolean) = !a || b\n'],
    [
      'a literal that starts a longer name',
      'fun f(c: Boolean): Boolean {\n    if (c) {\n        return trueValue\n    }\n    return false\n}\n',
    ],
    [
      'a block with more than the literal',
      'fun f(c: Boolean): Boolean {\n    if (c) {\n        return true; log()\n    } else {\n        return false\n    }\n}\n',
    ],
    [
      'a literal with a call after it',
      'fun f(c: Boolean) = if (c) true else false.also { log(it) }\n',
    ],
    [
      'a return that goes on to the next line',
      'fun f(c: Boolean, x: Boolean): Boolean {\n    if (c) return true\n    return false\n        || x\n}\n',
    ],
    [
      'a chain that goes on to the next line',
      'fun f(a: Boolean, b: Boolean, c: Boolean) {\n    val x = !a && !b\n        && c\n}\n',
    ],
    ['the form in a string', 'fun f() = "!(a == b) and !a && !b"\n'],
    ['the form in a comment', 'fun f() = 1 // !(a == b)\n'],
    ['a non-null assertion', 'fun f(a: Int?, x: Int?) = a!!.plus(1) != 2 && x!! == 1\n'],
    ['a negated type check of a negation', 'fun f(a: Boolean) = if (!a is Boolean) 1 else 2\n'],
  ])('leaves %s alone', (_name, source) => {
    expect(found(source)).toEqual([]);
  });
});
