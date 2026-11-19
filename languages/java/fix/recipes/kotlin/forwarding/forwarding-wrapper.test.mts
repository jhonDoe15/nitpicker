import { describe, expect, it } from 'vitest';
import { applyProject } from '../test-support/apply-project.mts';
import { kotlinForwardingWrapperRecipe } from './forwarding-wrapper.mts';

const MAIN = 'src/main/kotlin/demo/Prices.kt';
const USER = 'src/main/kotlin/other/User.kt';
const TEST = 'src/test/kotlin/demo/PricesTest.kt';
const fix = (files: Record<string, string>): Record<string, string> =>
  applyProject(kotlinForwardingWrapperRecipe, files);

describe('kotlinForwardingWrapperRecipe', () => {
  it('points the callers at the target and deletes the wrapper', () => {
    const files = {
      [MAIN]: [
        'package demo',
        '',
        'fun scaled(cents: Int): Int = cents * 100',
        '',
        'internal fun price(cents: Int): Int = scaled(cents)',
        '',
        'fun total() = price(5)',
        '',
      ].join('\n'),
      [USER]: 'package other\n\nimport demo.price\n\nfun run() = price(7)\n',
      [TEST]: 'package demo\n\nfun check() = price(1)\n',
    };

    expect(fix(files)).toEqual({
      [MAIN]:
        'package demo\n\nfun scaled(cents: Int): Int = cents * 100\n\nfun total() = scaled(5)\n',
      [USER]: 'package other\n\nimport demo.scaled\n\nfun run() = scaled(7)\n',
      [TEST]: 'package demo\n\nfun check() = scaled(1)\n',
    });
  });
  it('handles a block body that returns the call', () => {
    const files = {
      [MAIN]: [
        'package demo',
        '',
        'fun scaled(a: Int, b: Int): Int = a * b',
        '',
        'internal fun price(a: Int, b: Int): Int {',
        '    return scaled(a, b)',
        '}',
        '',
        'val x = price(1, 2)',
        '',
      ].join('\n'),
    };

    expect(fix(files)).toEqual({
      [MAIN]: 'package demo\n\nfun scaled(a: Int, b: Int): Int = a * b\n\nval x = scaled(1, 2)\n',
    });
  });
  it.each([
    ['is public', 'fun price(cents: Int): Int = scaled(cents)'],
    [
      'declares a narrower return type than inferred',
      'internal fun price(cents: Int): Number = scaled(cents)',
    ],
    ['changes an argument', 'internal fun price(cents: Int): Int = scaled(cents * 2)'],
    ['reorders arguments', 'internal fun price(a: Int, b: Int): Int = scaled(b, a)'],
    ['adds a default', 'internal fun price(cents: Int = 1): Int = scaled(cents)'],
    ['has an annotation', '@JvmName("p")\ninternal fun price(cents: Int): Int = scaled(cents)'],
    ['changes the type', 'internal fun price(cents: Long): Int = scaled(cents)'],
    ['is a factory named of', 'internal fun of(cents: Int): Int = scaled(cents)'],
  ])('leaves a wrapper that %s', (_name, wrapper) => {
    const text = [
      'package demo',
      '',
      'fun scaled(cents: Int): Int = cents',
      'fun scaled(a: Int, b: Int): Int = a',
      '',
      wrapper,
      '',
    ].join('\n');

    expect(fix({ [MAIN]: text })).toEqual({ [MAIN]: text });
  });
  it('leaves a wrapper that Java code calls or whose callers name arguments', () => {
    const wrapper = [
      'package demo',
      '',
      'fun scaled(cents: Int): Int = cents',
      '',
      'internal fun price(cents: Int): Int = scaled(cents)',
      '',
    ].join('\n');
    const java = 'class C { int f() { return PricesKt.price(1); } }\n';
    const named = 'package demo\n\nval x = price(cents = 1)\n';

    expect([
      fix({ [MAIN]: wrapper, 'src/main/java/demo/C.java': java }),
      fix({ [MAIN]: wrapper, [USER]: named }),
    ]).toEqual([
      { [MAIN]: wrapper, 'src/main/java/demo/C.java': java },
      { [MAIN]: wrapper, [USER]: named },
    ]);
  });
  it('reaches callers in files that did not change and spares other modules', () => {
    const wrapper = [
      'package demo',
      '',
      'fun scaled(cents: Int): Int = cents',
      '',
      'internal fun price(cents: Int): Int = scaled(cents)',
      '',
    ].join('\n');
    const files = { [MAIN]: wrapper, [USER]: 'package demo\n\nval x = price(1)\n' };
    const other = {
      [MAIN]: wrapper,
      'app/src/main/kotlin/demo/U.kt': 'package demo\n\nval x = price(1)\n',
    };

    expect(applyProject(kotlinForwardingWrapperRecipe, files, {}, [MAIN])).toEqual({
      [MAIN]: 'package demo\n\nfun scaled(cents: Int): Int = cents\n\n',
      [USER]: 'package demo\n\nval x = scaled(1)\n',
    });
    expect(applyProject(kotlinForwardingWrapperRecipe, other, {}, [MAIN])).toEqual(other);
  });
  it('leaves a wrapper whose target is overloaded or shadowed by a caller supertype', () => {
    const base = ['package demo', '', 'fun scaled(cents: Int): Int = cents', ''];
    const wrapper = 'internal fun price(cents: Int): Int = scaled(cents)\n';
    const overloaded = [
      ...base,
      'fun scaled(cents: Int, extra: Int): Int = cents',
      '',
      wrapper,
    ].join('\n');
    const shadowed = [
      ...base,
      wrapper,
      'class Holder : Base() {',
      '    fun use() = price(1)',
      '}',
      '',
    ].join('\n');

    expect([fix({ [MAIN]: overloaded }), fix({ [MAIN]: shadowed })]).toEqual([
      { [MAIN]: overloaded },
      { [MAIN]: shadowed },
    ]);
  });
});
