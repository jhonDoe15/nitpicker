import { describe, expect, it } from 'vitest';
import { factRuleSettings } from './fact-rules.mjs';

const LAYOUT = ['layout.sharedRoots', 'layout.featureRoots'];

describe('factRuleSettings', () => {
  it.each([['java'], ['kotlin']])(
    'gives %s the feature layout keys that contract-infrastructure-type reads',
    (language) => {
      expect(factRuleSettings(language)).toEqual(['testConsole', ...LAYOUT]);
    },
  );

  it('lists each setting once when a fact rule and contract-infrastructure-type read it', () => {
    expect(factRuleSettings('python')).toEqual(LAYOUT);
  });
});
