import { describe, expect, it } from 'vitest';
import { ALL_RECIPES } from '../engine/all-recipes.mjs';
import { defineRecipes } from '../engine/recipes.mjs';
import { DEFAULT_FIX_SOURCES, fixStatusFor, withFixStatus } from './fix-status.mjs';
import { FIX_PLAN_RULES } from './fix-plan-rules.mjs';
import { ruleEntry } from '../../../shared/reference/entry.mjs';
import { fixText } from '../../../shared/reference/fix-status.mjs';

function entry(tool, rule, fields = {}) {
  const analyzers = { java: ['java'], kotlin: ['kotlin'] };
  return ruleEntry({ tool, rule, page: 'java-checkstyle', analyzers, summary: 'x', ...fields });
}

function recipe(id, fields) {
  return {
    id,
    rules: [{ tool: 'checkstyle', rule: 'Demo' }],
    presets: ['java'],
    scope: 'file',
    safety: 'safe',
    plan: () => ({ fixes: [], notes: [] }),
    ...fields,
  };
}

function sources(recipes, plans = []) {
  return { recipes: defineRecipes(recipes), formatters: [], plans };
}

describe('fixStatusFor', () => {
  it('is automatic for a safe recipe in its presets only', () => {
    const own = sources([recipe('safe-demo')]);

    expect(fixStatusFor(entry('checkstyle', 'Demo'), 'java', own)).toBe('automatic');
    expect(fixStatusFor(entry('checkstyle', 'Demo'), 'kotlin', own)).toBe('none');
    expect(fixStatusFor(entry('checkstyle', 'Other'), 'java', own)).toBe('none');
  });

  it('needs --fix --rule for a recipe that wants a review, and a safe recipe wins over it', () => {
    const review = recipe('review-demo', { safety: 'review' });

    expect(fixStatusFor(entry('checkstyle', 'Demo'), 'java', sources([review]))).toBe('review');
    expect(
      fixStatusFor(entry('checkstyle', 'Demo'), 'java', sources([review, recipe('safe-demo')])),
    ).toBe('automatic');
  });

  it('matches a recipe rule against a pattern entry and a finding tool', () => {
    const family = entry('eslint', 'x/*', { pattern: '^x/', findingTools: ['eslint-lint'] });
    const own = sources([recipe('demo', { rules: [{ tool: 'eslint-lint', rule: 'x/one' }] })]);

    expect(fixStatusFor(family, 'java', own)).toBe('automatic');
  });

  it('shows a fix plan only where no recipe fixes the rule, and automatic over it', () => {
    const plans = [{ tool: 'checkstyle', rule: 'Demo', presets: ['java'] }];

    expect(fixStatusFor(entry('checkstyle', 'Demo'), 'java', sources([], plans))).toBe('plan');
    expect(fixStatusFor(entry('checkstyle', 'Demo'), 'kotlin', sources([], plans))).toBe('none');
    expect(fixStatusFor(entry('checkstyle', 'Demo'), 'java', sources([recipe('d')], plans))).toBe(
      'automatic',
    );
  });

  it('is automatic for a rule a tool fixer fixes in the preset', () => {
    const fixed = entry('eslint', 'curly', { fixableIn: ['java'] });

    expect(fixStatusFor(fixed, 'java', sources([]))).toBe('automatic');
    expect(fixStatusFor(fixed, 'kotlin', sources([]))).toBe('none');
  });
});

describe('the registered fixers', () => {
  it('has no fix plan rules until the plans exist', () => {
    expect(FIX_PLAN_RULES).toEqual([]);
  });

  it('gives every recipe rule an automatic or review status in the reference', () => {
    const rule = ALL_RECIPES[0].rules[0];
    const found = withFixStatus(entry(rule.tool, rule.rule), DEFAULT_FIX_SOURCES);

    expect(found.fix).toEqual({ java: 'automatic', kotlin: 'none' });
  });

  it('marks the formatter findings automatic in the presets that run the formatter', () => {
    const format = (tool, rule) => withFixStatus(entry(tool, rule)).fix;

    expect(format('google-java-format', 'format')).toEqual({
      java: 'automatic',
      kotlin: 'automatic',
    });
    expect(format('ktfmt', 'format')).toEqual({ java: 'none', kotlin: 'automatic' });
  });
});

describe('withFixStatus', () => {
  it('drops the tool fixer hint and gives the status per preset the entry has', () => {
    const found = withFixStatus(entry('eslint', 'curly', { fixableIn: ['java'] }), sources([]));

    expect(found.fixableIn).toBeUndefined();
    expect(found.fix).toEqual({ java: 'automatic', kotlin: 'none' });
  });
});

describe('rules the language fixers select', () => {
  const found = (tool, rule, preset) =>
    fixStatusFor(entry(tool, rule), preset, DEFAULT_FIX_SOURCES);

  it('counts the ruff fixes the gate promotes as automatic and the reviewed ones as review', () => {
    expect(found('ruff', 'PT018', 'python')).toBe('automatic');
    expect(found('ruff', 'E711', 'python')).toBe('review');
    expect(found('ruff', 'T201', 'python')).toBe('review');
    expect(found('ruff', 'T201', 'java')).toBe('none');
  });
  it('counts ESLint suggestions by their safety', () => {
    expect(found('eslint-lint', 'no-prototype-builtins', 'typescript')).toBe('automatic');
    expect(found('eslint-lint', 'use-isnan', 'javascript')).toBe('review');
    expect(found('eslint-lint', 'no-empty', 'typescript')).toBe('none');
    expect(found('eslint-lint', 'nitpicker/no-falsy-default', 'typescript')).toBe('review');
  });
});

describe('fixText', () => {
  it('says it in a sentence, or per preset when the presets differ', () => {
    const found = withFixStatus(entry('checkstyle', 'Demo'), sources([recipe('d')]));
    const review = { id: 'checkstyle/Demo', fix: { java: 'review' } };

    expect(fixText(found, ['java', 'kotlin'])).toBe('Automatic in Java, none in Kotlin.');
    expect(fixText(review, ['java'])).toBe(
      'With `nitpicker --fix --rule checkstyle/Demo`: `--fix` alone skips the rewrite, because it needs a review.',
    );
    expect(fixText({ fix: { java: 'plan' } }, ['java'])).toBe(
      'Fix plan: nitpicker writes the steps for the finding, and `--fix` does not rewrite the code.',
    );
  });
});
