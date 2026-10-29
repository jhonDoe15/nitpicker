import { describe, expect, it } from 'vitest';
import { strictBoundaryRules } from './architecture/strict-boundary-rules.mjs';
import { reactRuleIds } from './eslint-config/react/react-rules.mjs';
import { strictPresetConfig } from './eslint-config/strict.mjs';
import { defaultResolvedLayout } from './layout.mjs';
import { isStrictRule, strictEslintRuleIds } from './strict-rules.mjs';

describe('strict rule ids', () => {
  it('list exactly the rules of the real strict preset config', () => {
    const fromConfig = strictPresetConfig(defaultResolvedLayout, {}).flatMap((entry) =>
      Object.keys(entry.rules ?? {}),
    );
    expect(
      new Set(strictEslintRuleIds),
      'a strict rule was added or removed: update strictEslintRuleIds in languages/typescript/preset/strict-rules.mjs',
    ).toEqual(new Set(fromConfig));
  });

  it('recognises every ESLint and boundary rule of the preset', () => {
    const rules = [...strictEslintRuleIds, ...strictBoundaryRules.map(({ name }) => name)];
    expect(rules).not.toHaveLength(0);
    expect(rules.filter((rule) => !isStrictRule(rule))).toEqual([]);
  });

  it('recognises every React rule as strict without listing it among the always-on rules', () => {
    expect(reactRuleIds).not.toHaveLength(0);
    expect(reactRuleIds.filter((rule) => !isStrictRule(rule))).toEqual([]);
    expect(reactRuleIds.filter((rule) => strictEslintRuleIds.includes(rule))).toEqual([]);
  });
});
