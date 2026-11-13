import { describe, expect, it } from 'vitest';
import { activeRecipes, checkRecipe, defineRecipes, ruleName } from './recipes.mjs';

const valid = {
  id: 'demo',
  rules: [{ tool: 'demo', rule: 'shout' }],
  presets: ['java'],
  scope: 'file',
  safety: 'safe',
  plan: () => ({ fixes: [] }),
};

describe('checkRecipe', () => {
  it.each([
    [{ id: '' }, 'Recipe  has no id'],
    [{ rules: [] }, 'Recipe demo lists no rules'],
    [{ rules: [{ tool: 'demo' }] }, 'Recipe demo lists a rule without a tool and a rule id'],
    [{ presets: [] }, 'Recipe demo lists no presets'],
    [{ scope: 'repository' }, 'Recipe demo has scope repository, not file or project'],
    [{ safety: 'unsafe' }, 'Recipe demo has safety unsafe, not safe or review'],
    [{ plan: undefined }, 'Recipe demo has no plan function'],
  ])('refuses a recipe with %o', (override, message) => {
    expect(() => checkRecipe({ ...valid, ...override })).toThrow(message);
  });
  it('accepts a complete recipe', () => {
    expect(checkRecipe(valid)).toBe(valid);
  });
});

describe('defineRecipes', () => {
  it('refuses two recipes with one id', () => {
    expect(() => defineRecipes([valid, { ...valid }])).toThrow('Recipe demo is defined twice');
  });
  it('freezes the list', () => {
    expect(Object.isFrozen(defineRecipes([valid]))).toBe(true);
  });
});

describe('activeRecipes', () => {
  const review = { ...valid, id: 'review', safety: 'review' };
  const kotlin = { ...valid, id: 'kotlin', presets: ['kotlin'] };

  it('runs the safe recipes of the preset when no rule is selected', () => {
    expect(activeRecipes([valid, review, kotlin], { preset: 'java' })).toEqual([valid]);
  });
  it('runs the recipes of the selected rules, safe or review', () => {
    expect(
      activeRecipes([valid, review, kotlin], { preset: 'java', selectedRules: ['demo/shout'] }),
    ).toEqual([valid, review]);
    expect(activeRecipes([valid], { preset: 'java', selectedRules: ['demo/other'] })).toEqual([]);
  });
  it('names a rule as tool/rule', () => {
    expect(ruleName({ tool: 'checkstyle', rule: 'UpperEll' })).toBe('checkstyle/UpperEll');
  });
});
