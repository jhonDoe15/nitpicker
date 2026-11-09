import { describe, expect, it } from 'vitest';
import { factRuleSettings } from './fact-rules.mjs';

const LAYOUT = ['layout.sharedRoots', 'layout.featureRoots'];

describe('factRuleSettings', () => {
  it.each([
    ['java', ['testConsole', ...LAYOUT]],
    ['kotlin', ['testConsole', 'protocols', ...LAYOUT]],
  ])(
    'gives %s the feature layout keys that contract-infrastructure-type reads',
    (language, keys) => {
      expect(factRuleSettings(language)).toEqual(keys);
    },
  );

  it('lists each setting once when a fact rule and contract-infrastructure-type read it', () => {
    const settings = factRuleSettings('python');

    expect(LAYOUT.map((key) => settings.filter((setting) => setting === key).length)).toEqual([
      1, 1,
    ]);
  });
});
