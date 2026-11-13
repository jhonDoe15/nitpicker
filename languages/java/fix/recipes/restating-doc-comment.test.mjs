import { describe, expect, it } from 'vitest';
import { defineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import {
  javaRestatingDocCommentRecipe,
  kotlinRestatingDocCommentRecipe,
} from './restating-doc-comment.mjs';

const MAIN = 'src/main/java/demo';
const JAVA = `class Account {
    /**
     * Gets the balance.
     */
    int getBalance() { return 1; }

    /** Converts cents to euros, rounding half up. */
    int toEuros() { return 2; }
}
`;
const KOTLIN = `class Account {
    /** The balance. */
    val balance = 1

    /**
     * Opens the account for a customer.
     */
    fun open() {}
}
`;

function apply(recipe, name, text) {
  const { fixes } = recipe.plan({ files: [{ path: name, text }], inputs: {} });
  const edits = fixes.flatMap((fix) => fix.edits).sort((left, right) => right.start - left.start);
  return {
    fixes,
    text: edits.reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      text,
    ),
  };
}

describe('the restating doc comment recipes', () => {
  it('are safe recipes, one per preset, for the facts rule', () => {
    expect(() =>
      defineRecipes([javaRestatingDocCommentRecipe, kotlinRestatingDocCommentRecipe]),
    ).not.toThrow();
    expect(
      [javaRestatingDocCommentRecipe, kotlinRestatingDocCommentRecipe].map(
        ({ presets, safety }) => [presets, safety],
      ),
    ).toEqual([
      [['java'], 'safe'],
      [['kotlin'], 'safe'],
    ]);
  });

  it('deletes a Javadoc that only restates the method name, with its lines', () => {
    const { fixes, text } = apply(javaRestatingDocCommentRecipe, `${MAIN}/Account.java`, JAVA);

    expect(text).toBe(JAVA.replace('    /**\n     * Gets the balance.\n     */\n', ''));
    expect(fixes.map(({ finding }) => finding)).toEqual([
      { tool: 'facts', rule: 'doc-comment-content', path: `${MAIN}/Account.java`, line: 2 },
    ]);
  });

  it('deletes a one-line KDoc and leaves one that says more, in Kotlin and in Java files', () => {
    const { text } = apply(kotlinRestatingDocCommentRecipe, 'src/main/kotlin/Account.kt', KOTLIN);
    const java = apply(kotlinRestatingDocCommentRecipe, `${MAIN}/Account.java`, JAVA);

    expect(text).toBe(KOTLIN.replace('    /** The balance. */\n', ''));
    expect(java.text).toBe(JAVA.replace('    /**\n     * Gets the balance.\n     */\n', ''));
  });

  it('reads only Java files in the java preset and only main source sets', () => {
    const files = [
      { path: 'src/main/kotlin/Account.kt', text: KOTLIN },
      { path: 'src/test/java/AccountTest.java', text: JAVA },
    ];

    expect(javaRestatingDocCommentRecipe.plan({ files, inputs: {} }).fixes).toEqual([]);
  });

  it('skips a file an exception covers', () => {
    const inputs = { isExcepted: () => true };

    expect(
      javaRestatingDocCommentRecipe.plan({
        files: [{ path: `${MAIN}/Account.java`, text: JAVA }],
        inputs,
      }).fixes,
    ).toEqual([]);
  });

  it('leaves a comment that shares its line with code', () => {
    const text = 'class A { /** Gets the id. */ int getId() { return 1; } }\n';

    expect(apply(javaRestatingDocCommentRecipe, `${MAIN}/A.java`, text).fixes).toEqual([]);
  });
});
