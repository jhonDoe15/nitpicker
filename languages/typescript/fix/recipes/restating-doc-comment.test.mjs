import { describe, expect, it } from 'vitest';
import { typescriptRestatingDocCommentRecipe as recipe } from './restating-doc-comment.mjs';

function apply(name, text, inputs = {}) {
  const { fixes } = recipe.plan({ files: [{ path: name, text }], inputs });
  const edits = fixes.flatMap((fix) => fix.edits).sort((left, right) => right.start - left.start);
  return {
    fixes,
    text: edits.reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      text,
    ),
  };
}

const SOURCE = `/** Gets the user name. */
export function getUserName() {
  return 'a';
}

/**
 * Seconds before the session expires, counted from the last request.
 */
export const sessionTimeout = 60;

/**
 * User account.
 */
export type UserAccount = {
  /** The id. */
  id: string;
  /** Email address, lower case. */
  email: string;
};

/** Helper. */
function helper() {}
`;

describe('typescriptRestatingDocCommentRecipe', () => {
  it('is a safe recipe for the typescript preset and the no-comments rule', () => {
    expect([recipe.presets, recipe.safety, recipe.scope, recipe.rules]).toEqual([
      ['typescript'],
      'safe',
      'file',
      [{ tool: 'eslint', rule: 'nitpicker/no-comments' }],
    ]);
  });

  it('deletes the exported doc comments that only restate the name, members included', () => {
    const { fixes, text } = apply('src/a.ts', SOURCE);

    expect(text).toBe(`export function getUserName() {
  return 'a';
}

/**
 * Seconds before the session expires, counted from the last request.
 */
export const sessionTimeout = 60;

export type UserAccount = {
  id: string;
  /** Email address, lower case. */
  email: string;
};

/** Helper. */
function helper() {}
`);
    expect(fixes.map(({ finding }) => finding.line)).toEqual([1, 11, 15]);
  });

  it('reads TSX, and leaves a doc comment that shares its line with code', () => {
    const tsx = '/** Button. */\nexport const Button = () => <b />;\n';
    const inline = 'export const a = 1; /** A. */\nexport const b = 2;\n';

    expect(apply('src/Button.tsx', tsx).text).toBe('export const Button = () => <b />;\n');
    expect(apply('src/b.ts', inline).fixes).toEqual([]);
  });

  it('skips JavaScript files, files it cannot parse and files an exception covers', () => {
    expect(apply('src/a.js', SOURCE).fixes).toEqual([]);
    expect(apply('src/a.ts', 'export const = ;').fixes).toEqual([]);
    expect(apply('src/a.ts', SOURCE, { isExcepted: () => true }).fixes).toEqual([]);
  });
});
