import { describe, expect, it } from 'vitest';
import { strictBoundaryRules } from './architecture/strict-boundary-rules.mjs';
import { reactRuleIds } from './eslint-config/react/react-rules.mjs';
import { strictPresetConfig } from './eslint-config/strict.mjs';
import { defaultResolvedLayout } from './layout.mjs';
import { isStrictRule, strictEslintRuleIds } from './strict-rules.mjs';

const PARAMETER_ONLY_RULE = '@typescript-eslint/no-unused-vars';

describe('strict rule ids', () => {
  it('list exactly the rules of the real strict preset config', () => {
    const fromConfig = strictPresetConfig(defaultResolvedLayout, {})
      .flatMap((entry) => Object.keys(entry.rules ?? {}))
      .filter((rule) => rule !== PARAMETER_ONLY_RULE);
    expect(
      new Set(strictEslintRuleIds),
      'a strict rule was added or removed: update strictEslintRuleIds in languages/typescript/preset/strict-rules.mjs',
    ).toEqual(new Set(fromConfig));
  });

  it('recognises every ESLint and boundary rule of the preset', () => {
    for (const rule of [...strictEslintRuleIds, ...strictBoundaryRules.map(({ name }) => name)]) {
      expect(isStrictRule(rule)).toBe(true);
    }
  });

  it('recognises every React rule as strict without listing it among the always-on rules', () => {
    for (const rule of reactRuleIds) {
      expect(isStrictRule(rule), rule).toBe(true);
      expect(strictEslintRuleIds, rule).not.toContain(rule);
    }
  });
});
