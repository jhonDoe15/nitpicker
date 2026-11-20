import { describe, expect, it } from 'vitest';
import { applyProject } from '../test-support/apply-project.mts';
import { kotlinCompatibilityShimRecipe } from './compatibility-shim.mts';

const MAIN = 'src/main/kotlin/demo/Api.kt';
const USER = 'src/main/kotlin/other/User.kt';
const TEST = 'src/test/kotlin/demo/ApiTest.kt';
const fix = (files: Record<string, string>): Record<string, string> =>
  applyProject(kotlinCompatibilityShimRecipe, files);

describe('kotlinCompatibilityShimRecipe', () => {
  it('moves the users of a type alias to the type and deletes the alias', () => {
    const files = {
      [MAIN]: [
        'package demo',
        '',
        'class Order',
        '',
        '/** Old name. */',
        'typealias Purchase = Order',
        '',
        'fun load(): Purchase = Order()',
        '',
      ].join('\n'),
      [USER]: [
        'package other',
        '',
        'import demo.Purchase',
        '',
        'fun use(p: Purchase) = p',
        '',
      ].join('\n'),
      [TEST]: 'package demo\n\nval p: demo.Purchase = Order()\n',
    };

    expect(fix(files)).toEqual({
      [MAIN]: 'package demo\n\nclass Order\n\nfun load(): Order = Order()\n',
      [USER]: 'package other\n\nimport demo.Order\n\nfun use(p: Order) = p\n',
      [TEST]: 'package demo\n\nval p: demo.Order = Order()\n',
    });
  });
  it('removes a deprecation marker above a type alias with the alias', () => {
    const files = {
      [MAIN]: [
        'package demo',
        '',
        'class Order',
        '',
        '@Deprecated("use Order")',
        'typealias Purchase = Order',
        '',
      ].join('\n'),
    };

    expect(fix(files)).toEqual({ [MAIN]: 'package demo\n\nclass Order\n\n' });
  });
  it('renames the callers of a deprecated forwarding function and deletes it', () => {
    const files = {
      [MAIN]: [
        'package demo',
        '',
        'fun price(a: Int, b: Int): Int = a + b',
        '',
        '@Deprecated("use price", ReplaceWith("price(a, b)"))',
        'fun cost(a: Int, b: Int): Int = price(a, b)',
        '',
        'fun total() = cost(1, 2)',
        '',
      ].join('\n'),
      [USER]: 'package other\n\nimport demo.cost\n\nfun run() = cost(3, 4)\n',
    };

    expect(fix(files)).toEqual({
      [MAIN]:
        'package demo\n\nfun price(a: Int, b: Int): Int = a + b\n\nfun total() = price(1, 2)\n',
      [USER]: 'package other\n\nimport demo.price\n\nfun run() = price(3, 4)\n',
    });
  });
  it('leaves a function that adds behaviour, differs in arguments or has named calls', () => {
    const adds = [
      'package demo',
      '',
      'fun price(a: Int): Int = a',
      '',
      '@Deprecated("use price", ReplaceWith("price(a)"))',
      'fun cost(a: Int): Int = price(a) + 1',
      '',
    ].join('\n');
    const reordered = [
      'package demo',
      '',
      'fun price(a: Int, b: Int): Int = a - b',
      '',
      '@Deprecated("use price", ReplaceWith("price(b, a)"))',
      'fun cost(a: Int, b: Int): Int = price(b, a)',
      '',
    ].join('\n');
    const named = [
      'package demo',
      '',
      'fun price(a: Int): Int = a',
      '',
      '@Deprecated("use price", ReplaceWith("price(a)"))',
      'fun cost(a: Int): Int = price(a)',
      '',
      'fun total() = cost(a = 1)',
      '',
    ].join('\n');

    expect([fix({ [MAIN]: adds }), fix({ [MAIN]: reordered }), fix({ [MAIN]: named })]).toEqual([
      { [MAIN]: adds },
      { [MAIN]: reordered },
      { [MAIN]: named },
    ]);
  });
  it('leaves a shim that Java code or a clashing declaration still names', () => {
    const alias = 'package demo\n\nclass Order\n\ntypealias Purchase = Order\n';
    const java = 'package demo;\n\nclass Caller { Purchase p; }\n';
    const clash = 'package other\n\nclass Purchase\n';
    const files = {
      java: { [MAIN]: alias, 'src/main/java/demo/Caller.java': java },
      clash: { [MAIN]: alias, [USER]: clash },
      other: {
        [MAIN]: 'package demo\n\nclass Order\n\ntypealias Purchase = Order\n',
        [USER]: 'package other\n\nval x = demo.Holder.Purchase\n',
      },
    };

    expect([fix(files.java), fix(files.clash), fix(files.other)]).toEqual([
      files.java,
      files.clash,
      files.other,
    ]);
  });
  it('reaches users in files that did not change and leaves an overloaded replacement', () => {
    const alias = 'package demo\n\nclass Order\n\ntypealias Purchase = Order\n';
    const files = { [MAIN]: alias, [USER]: 'package demo\n\nval p: Purchase? = null\n' };
    const overloaded = [
      'package demo',
      '',
      'fun price(a: Int): Int = a',
      'fun price(a: String): Int = 0',
      '',
      '@Deprecated("use price", ReplaceWith("price(a)"))',
      'fun cost(a: Int): Int = price(a)',
      '',
    ].join('\n');

    expect(applyProject(kotlinCompatibilityShimRecipe, files, {}, [MAIN])[USER]).toBe(
      'package demo\n\nval p: Order? = null\n',
    );
    expect(fix({ [MAIN]: overloaded })).toEqual({ [MAIN]: overloaded });
  });
});
