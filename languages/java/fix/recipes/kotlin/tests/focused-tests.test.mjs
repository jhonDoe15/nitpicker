import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mjs';
import { focusedTestRecipe } from './focused-tests.mjs';

const HEAD = 'import io.kotest.core.spec.style.FunSpec\n';
const TEST = 'src/test/kotlin/demo/ASpec.kt';
const fix = (text) =>
  applyRecipe(focusedTestRecipe, `${HEAD}${text}\n`, TEST).slice(HEAD.length, -1);

describe('focusedTestRecipe', () => {
  it('drops the f prefix from registrations', () => {
    expect(
      fix(
        'class A : FunSpec({\n    ftest("a") { }\n    fit("b") { }\n    fshould("c") { }\n    fgiven("d") { }\n})',
      ),
    ).toBe(
      'class A : FunSpec({\n    test("a") { }\n    it("b") { }\n    should("c") { }\n    given("d") { }\n})',
    );
  });
  it('drops the f: prefix from names in every style', () => {
    expect(
      fix(
        'class A : StringSpec({\n    "f: first" { }\n    test("f:second") { }\n    "f: tree" - { }\n})',
      ),
    ).toBe(
      'class A : StringSpec({\n    "first" { }\n    test("f:second") { }\n    "tree" - { }\n})',
    );
  });
  it('fixes only the outermost focus, like the rule reports', () => {
    const text = 'class A : FunSpec({\n    fcontext("a") {\n        ftest("b") { }\n    }\n})';

    expect(fix(text)).toBe(
      'class A : FunSpec({\n    context("a") {\n        ftest("b") { }\n    }\n})',
    );
    expect(plannedLines(focusedTestRecipe, `${HEAD}${text}\n`, TEST)).toEqual([3]);
  });
  it('leaves other names and files without Kotest alone', () => {
    const text = 'class A : FunSpec({\n    test("fine") { }\n    val fit = 3\n    "of: x" { }\n})';

    expect(fix(text)).toBe(text);
    const plain = 'fun f() { fit("a") }\n';

    expect(applyRecipe(focusedTestRecipe, plain, TEST)).toBe(plain);
  });
  it('leaves main sources alone', () => {
    const text = `${HEAD}class A : FunSpec({ ftest("a") { } })\n`;

    expect(applyRecipe(focusedTestRecipe, text)).toBe(text);
  });
});
