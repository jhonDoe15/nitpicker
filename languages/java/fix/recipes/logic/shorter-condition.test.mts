import { describe, expect, it } from 'vitest';
import { shorterConditionRecipe as recipe } from './shorter-condition.mts';
import { applied } from '../extract/test-support/sources.mts';

const PATH = 'src/main/java/shop/Rules.java';
const TEXT = 'class Rules {\n  boolean both(int n) { return n > 3 && n > 5; }\n}\n';

function planned(path: string, inputs: Readonly<Record<string, unknown>> = {}) {
  return recipe.plan({ files: [{ path, text: TEXT }], projectRoot: '/nonexistent', inputs });
}

describe('shorterConditionRecipe', () => {
  it('is a review recipe for the shorter-condition rule of the Java and Kotlin presets', () => {
    expect([recipe.safety, recipe.scope, recipe.presets, recipe.rules]).toEqual([
      'review',
      'file',
      ['java', 'kotlin'],
      [{ tool: 'structure', rule: 'shorter-condition' }],
    ]);
  });

  it('writes the shorter form in place of the condition', () => {
    const { fixes } = planned(PATH);

    expect(fixes.map(({ finding }) => finding)).toEqual([
      { tool: 'structure', rule: 'shorter-condition', path: PATH, line: 2 },
    ]);
    expect(applied(TEXT, fixes[0]?.edits ?? [])).toBe(
      'class Rules {\n  boolean both(int n) { return n > 5; }\n}\n',
    );
  });

  it('leaves generated sources and files the project excepts from the rule', () => {
    const excepted = {
      isExcepted: (rule: string, name: string) => rule === 'shorter-condition' && name === PATH,
    };

    expect([
      planned('build/generated/sources/shop/Rules.java').fixes,
      planned(PATH, excepted).fixes,
      planned('src/main/resources/Rules.txt').fixes,
    ]).toEqual([[], [], []]);
  });
});
