import { describe, expect, it } from 'vitest';
import { switchLabelsRecipe as recipe } from './switch-labels.mts';
import { applied } from '../extract/test-support/sources.mts';

const PATH = 'src/main/kotlin/shop/Rules.kt';
const TEXT =
  'fun name(n: Int) = when (n) {\n    1 -> "low"\n    2 -> "low"\n    else -> "other"\n}\n';

describe('switchLabelsRecipe', () => {
  it('is a review recipe for the duplicate-branch rule of the Java and Kotlin presets', () => {
    expect([recipe.safety, recipe.scope, recipe.presets, recipe.rules]).toEqual([
      'review',
      'file',
      ['java', 'kotlin'],
      [{ tool: 'structure', rule: 'duplicate-branch' }],
    ]);
  });

  it('merges the labels of cases with the same body', () => {
    const { fixes } = recipe.plan({
      files: [{ path: PATH, text: TEXT }],
      projectRoot: '/nonexistent',
    });

    expect(fixes.map(({ finding }) => finding)).toEqual([
      { tool: 'structure', rule: 'duplicate-branch', path: PATH, line: 3 },
    ]);
    expect(applied(TEXT, fixes[0]?.edits ?? [])).toBe(
      'fun name(n: Int) = when (n) {\n    1, 2 -> "low"\n    else -> "other"\n}\n',
    );
  });
});
