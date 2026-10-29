import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { compatibilityShims } from './compatibility-shims.mjs';

function found(source) {
  const scanned = scanKotlinSource(source);
  return compatibilityShims(scanned).map((reported) => [
    lineOf(scanned, reported.offset),
    reported.subject,
  ]);
}

describe('compatibilityShims', () => {
  it.each([
    ['a plain annotation', '@Deprecated\nfun old() {}\n', [[1, '@Deprecated']]],
    [
      'an annotation with a replacement',
      '@Deprecated("use total", ReplaceWith("total()"))\nfun old() {}\n',
      [[1, '@Deprecated']],
    ],
    ['a class', '@Deprecated("gone")\nclass Old\n', [[1, '@Deprecated']]],
    [
      'a type alias of a type of the file',
      'class Order\n\ntypealias Purchase = Order\n',
      [[3, 'typealias Purchase']],
    ],
  ])('flags %s', (_name, source, expected) => {
    expect(found(source)).toEqual(expected);
  });

  it.each([
    ['an override of a deprecated member', '@Deprecated("x")\noverride fun old() {}\n'],
    ['a type alias of a library type', 'typealias Handler = Callback\n'],
    ['a generic type alias', 'class Order\n\ntypealias Orders = List<Order>\n'],
    ['a function type alias', 'typealias Handler = (String) -> Unit\n'],
    ['no deprecation', 'fun current() {}\n'],
    ['a comment', '// @Deprecated\nfun current() {}\n'],
  ])('passes %s', (_name, source) => {
    expect(found(source)).toEqual([]);
  });
});
