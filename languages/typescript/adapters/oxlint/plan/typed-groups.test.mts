import { describe, expect, it } from 'vitest';
import type { OxlintPlan, PlanGroup } from './oxlint-shapes.mts';
import { residualRules, typedGroups } from './typed-groups.mts';

const group = (rules: readonly string[], programRules?: readonly string[]): PlanGroup => ({
  files: ['src/a.ts'],
  rules: Object.fromEntries(rules.map((ruleId) => [ruleId, 'error'])),
  ...(programRules === undefined ? {} : { programRules }),
});

const plan = (groups: readonly PlanGroup[]): OxlintPlan => ({
  groups,
  noInlineConfig: [],
  typedPluginRules: [
    '@typescript-eslint/no-floating-promises',
    '@typescript-eslint/naming-convention',
    'nitpicker/no-parameter-mutation',
    'nitpicker/no-falsy-default',
  ],
  ruleMessages: {},
  nativeRules: [{ scope: 'typescript', value: 'no-floating-promises', type_aware: true }],
});

const ported = new Set(['nitpicker/no-parameter-mutation', 'nitpicker/no-falsy-default']);

describe('typed rules left for the residual ESLint pass', () => {
  it('leaves out typed rules that oxlint runs natively', () => {
    const native = group([
      '@typescript-eslint/no-floating-promises',
      'nitpicker/no-parameter-mutation',
      'no-debugger',
    ]);

    expect(residualRules(plan([native]), native)).toEqual(['nitpicker/no-parameter-mutation']);
  });

  it('keeps typed rules that run as bridged plugin rules and the program rules', () => {
    const bridged = group(
      ['@typescript-eslint/naming-convention', 'nitpicker/no-falsy-default'],
      ['nitpicker/no-parameter-mutation'],
    );

    expect(residualRules(plan([bridged]), bridged)).toEqual([
      '@typescript-eslint/naming-convention',
      'nitpicker/no-falsy-default',
      'nitpicker/no-parameter-mutation',
    ]);
  });
});

describe('plan groups whose typed rules go to the engine', () => {
  const retired = group([
    '@typescript-eslint/no-floating-promises',
    'nitpicker/no-parameter-mutation',
    'nitpicker/no-falsy-default',
  ]);
  const partial = group(['@typescript-eslint/naming-convention', 'nitpicker/no-falsy-default']);
  const untyped = group(['@typescript-eslint/no-floating-promises', 'no-debugger']);
  const typedPlan = plan([retired, partial, untyped]);

  it('takes a group whose residual typed rules all run on the engine, with native typed rules beside them', () => {
    expect(typedGroups(typedPlan, undefined, ported)).toEqual([retired]);
  });

  it('takes every group with a ported rule when always, and none when off', () => {
    expect(typedGroups(typedPlan, 'always', ported)).toEqual([retired, partial]);
    expect(typedGroups(typedPlan, 'off', ported)).toEqual([]);
  });
});
