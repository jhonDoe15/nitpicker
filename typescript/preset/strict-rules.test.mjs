import { describe, expect, it } from 'vitest';
import { strictBoundaryRules } from './architecture/strict-boundary-rules.mjs';
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
      'a strict rule was added or removed: update strictEslintRuleIds in preset/strict-rules.mjs',
    ).toEqual(new Set(fromConfig));
  });

  it('recognises every ESLint and boundary rule of the preset', () => {
    for (const rule of [...strictEslintRuleIds, ...strictBoundaryRules.map(({ name }) => name)]) {
      expect(isStrictRule(rule)).toBe(true);
    }
  });
});
