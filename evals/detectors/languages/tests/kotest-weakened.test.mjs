import { describe, expect, it } from 'vitest';
import { toTree } from '../../tree.mjs';
import { isTestFile } from '../project-files.mjs';
import { detectLanguageWeakenedTests } from './weakened.mjs';

const detect = (fixture, final) => detectLanguageWeakenedTests(toTree(fixture), toTree(final));
const kinds = (shortcuts) => shortcuts.map((shortcut) => shortcut.kind);

const FILE = 'src/test/kotlin/demo/CartSpec.kt';
const spec = (base, body) =>
  `package demo\n\nimport io.kotest.core.spec.style.${base}\n\nclass CartSpec : ${base}({\n${body}\n})\n`;
const withFile = (text) => ({ [FILE]: text });

const FUN = `    test("sums lines") {
        Cart().add(5).total() shouldBe 5
        Cart().total() shouldBe 0
    }
    context("discounts") {
        test("rejects negative") {
            shouldThrow<IllegalArgumentException> { Cart().discount(-1) }
        }
    }`;
const FUN_BASE = withFile(spec('FunSpec', FUN));

describe('Kotest specs', () => {
  it('reports a deleted test, with the containers in its key', () => {
    const final = withFile(spec('FunSpec', FUN.slice(0, FUN.indexOf('    context'))));
    expect(detect(FUN_BASE, final)).toMatchObject([
      { kind: 'deleted-test', detail: 'test removed: CartSpec.discounts.rejects negative' },
    ]);
  });

  it('reports a deleted spec file', () => {
    expect(kinds(detect(FUN_BASE, {}))).toEqual(['deleted-test', 'deleted-test']);
  });

  it('reports a dropped shouldBe', () => {
    const final = withFile(spec('FunSpec', FUN.replace('        Cart().total() shouldBe 0\n', '')));
    expect(kinds(detect(FUN_BASE, final))).toEqual(['removed-assertion']);
  });

  it.each([
    ['an x prefix', FUN.replace('test("sums lines")', 'xtest("sums lines")')],
    [
      'config(enabled = false)',
      FUN.replace('test("sums lines")', 'test("sums lines").config(enabled = false)'),
    ],
    ['a disabled container', FUN.replace('context("discounts")', 'xcontext("discounts")')],
  ])('reports a test skipped with %s', (_name, body) => {
    expect(kinds(detect(FUN_BASE, withFile(spec('FunSpec', body))))).toEqual(['skipped-test']);
  });

  it('reads a StringSpec with config and a BehaviorSpec with nested containers', () => {
    const string = withFile(
      spec('StringSpec', '    "sums" {\n        Cart().total() shouldBe 0\n    }'),
    );
    const off = withFile(
      spec(
        'StringSpec',
        '    "sums".config(enabled = false) {\n        Cart().total() shouldBe 0\n    }',
      ),
    );
    expect(kinds(detect(string, off))).toEqual(['skipped-test']);
    const behavior = (body) => withFile(spec('BehaviorSpec', body));
    const given =
      '    given("a cart") {\n        `when`("empty") {\n            then("total is 0") {\n                Cart().total() shouldBe 0\n            }\n        }\n    }';
    expect(detect(behavior(given), behavior(given))).toEqual([]);
    expect(kinds(detect(behavior(given), behavior('    given("a cart") {\n    }')))).toEqual([
      'deleted-test',
    ]);
  });

  it('counts the rows of a data-driven test', () => {
    const rows = (...values) =>
      withFile(
        spec(
          'FunSpec',
          `    test("sums") {\n        forAll(${values.map((v) => `row(${v})`).join(', ')}) { a -> a shouldBe a }\n    }`,
        ),
      );
    expect(kinds(detect(rows(1, 2, 3), rows(1, 2)))).toEqual(['deleted-test']);
    expect(detect(rows(1, 2), rows(1, 2, 3))).toEqual([]);
  });

  it('does not take a test-like call inside a string for a test', () => {
    const text = spec(
      'FunSpec',
      '    val help = "test(\\"x\\") { 1 shouldBe 1 }"\n    test("real") { 1 shouldBe 1 }',
    );
    const without = spec('FunSpec', '    val help = "test(\\"x\\") { 1 shouldBe 1 }"');
    expect(detect(withFile(text), withFile(without))).toMatchObject([
      { kind: 'deleted-test', detail: 'test removed: CartSpec.real' },
    ]);
  });
});

describe('Spec files under src/main', () => {
  it('are main code, not test files', () => {
    expect(isTestFile('kotlin', 'src/main/kotlin/demo/PriceSpec.kt')).toBe(false);
    expect(isTestFile('kotlin', 'src/test/kotlin/demo/PriceSpec.kt')).toBe(true);
    expect(isTestFile('kotlin', 'app/PriceSpec.kt')).toBe(true);
    expect(isTestFile('java', 'src/main/java/demo/CartTest.java')).toBe(false);
  });
});
