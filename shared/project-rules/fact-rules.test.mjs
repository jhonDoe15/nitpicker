import { describe, expect, it } from 'vitest';
import { factRuleSettings, registeredFactRules } from './fact-rules.mjs';

describe('factRuleSettings', () => {
  it.each([['java'], ['kotlin'], ['python']])(
    'gives %s the feature layout keys that contract-infrastructure-type reads',
    (language) => {
      expect(factRuleSettings(language)).toEqual(
        expect.arrayContaining(['layout.sharedRoots', 'layout.featureRoots']),
      );
    },
  );

  it('lists each setting once and keeps the rules a language runs itself out of the fact rules', () => {
    const settings = factRuleSettings('python');

    expect(settings).toEqual([...new Set(settings)]);
    expect(registeredFactRules('java')).not.toContain('contract-infrastructure-type');
  });
});
