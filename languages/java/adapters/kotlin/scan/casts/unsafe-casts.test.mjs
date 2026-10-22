import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { unsafeCasts } from './unsafe-casts.mjs';

function found(source) {
  const scanned = scanKotlinSource(source);
  return unsafeCasts(scanned).map(({ rule, offset }) => [rule, lineOf(scanned, offset)]);
}

describe('unsafeCasts', () => {
  it.each([
    ['a cast', 'fun text(value: Any): String = value as String\n'],
    ['a cast to a nullable type', 'fun text(value: Any): String? = value as String?\n'],
    ['a generic cast', 'fun names(value: Any) = value as List<String>\n'],
    ['a cast to a qualified type', 'fun id(value: Any) = value as java.util.UUID\n'],
    ['a cast on the next line', 'fun id(value: Any) = value\n    as Long\n'],
    ['an upcast to a non-null Any', 'fun show(value: String) = println(value as Any)\n'],
    ['a reified cast', 'inline fun <reified T> pick(value: Any): T = value as T\n'],
  ])('flags %s', (_name, source) => {
    expect(found(source).map(([rule]) => rule)).toEqual(['UnsafeCastOperator']);
  });

  it.each([
    ['a safe cast', 'fun text(value: Any): String? = value as? String\n'],
    ['an import alias', 'import java.util.List as JList\n'],
    ['a type hint for null', 'val none = null as String?\n'],
    ['an upcast to Any?', 'fun show(value: String) = println(value as Any?)\n'],
    ['a string', 'val text = "value as String"\n'],
    ['a comment', '// value as String\nval x = 1\n'],
    ['a backticked name', 'fun `as`(value: Int) = value\n'],
    ['a name that starts with as', 'val assertion = 1\nval ass = 2\n'],
    ['a smart cast', 'fun text(value: Any): String = if (value is String) value else ""\n'],
  ])('passes %s', (_name, source) => {
    expect(found(source)).toEqual([]);
  });

  it('reports the line of each cast', () => {
    expect(found('fun a(v: Any) = v as Int\n\nfun b(v: Any) = v as Long\n')).toEqual([
      ['UnsafeCastOperator', 1],
      ['UnsafeCastOperator', 3],
    ]);
  });
});
