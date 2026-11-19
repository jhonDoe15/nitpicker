import { describe, expect, it } from 'vitest';
import { applied } from '../test-support/apply-recipe.mts';
import { emptyStaticBlockRecipe } from './empty-static-block.mts';

describe('emptyStaticBlockRecipe', () => {
  it('deletes an empty static block with its line', () => {
    expect(
      applied(
        emptyStaticBlockRecipe,
        'export class Empty {\n  static {}\n  readonly size = 1;\n}\n',
      ),
    ).toEqual({ text: 'export class Empty {\n  readonly size = 1;\n}\n', notes: [] });
  });

  it('deletes a static block that shares its line', () => {
    expect(applied(emptyStaticBlockRecipe, 'export class Empty { static {} }\n').text).toBe(
      'export class Empty {  }\n',
    );
  });

  it('leaves a static block with statements or a comment', () => {
    const text =
      'export class Counted {\n  static {\n    // set up later\n  }\n  static { Counted.count = 0; }\n  static count = 1;\n}\n';

    expect(applied(emptyStaticBlockRecipe, text)).toEqual({ text, notes: [] });
  });

  it('honours an exception for the file', () => {
    const text = 'export class Empty {\n  static {}\n}\n';
    const { fixes } = emptyStaticBlockRecipe.plan({
      files: [{ path: 'src/main/sample.ts', text }],
      inputs: { isExcepted: (rule) => rule === 'no-empty-static-block' },
    });

    expect(fixes).toEqual([]);
  });
});
