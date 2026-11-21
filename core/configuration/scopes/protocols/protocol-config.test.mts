import { describe, expect, it } from 'vitest';
import { resolveHeadPolicy } from '../../../../shared/head-policy.mjs';
import { validateConfig } from '../../validate.mts';
import {
  DESIGN_RULE_IDS,
  DESIGN_RULE_LANGUAGES,
} from '../../../../shared/project-rules/design/design-rules.mjs';
import { registeredFactRules } from '../../../../shared/project-rules/fact-rules.mjs';

const session = { type: 'Session', open: ['begin'], close: ['commit', 'rollback'] };
const PRESETS = Object.keys(DESIGN_RULE_LANGUAGES[DESIGN_RULE_IDS.protocolContract] ?? {});
const runsProtocols = (preset: string) => registeredFactRules(preset).includes('protocol-contract');

describe('protocols config', () => {
  it.each([
    [{ protocols: [] }],
    [{ protocols: [session, { ...session, type: 'Lock', steps: ['write'], reason: 'one owner' }] }],
  ])('accepts %j', (config) => {
    expect(validateConfig(config)).toEqual(config);
  });

  it.each([
    [{ protocols: {} }, /"protocols" must be an array/],
    [{ protocols: [1] }, /"protocols\[0\]" must be an object/],
    [{ protocols: [{ ...session, after: [] }] }, /unknown key "after" in "protocols\[0\]"/],
    [{ protocols: [{ ...session, type: '' }] }, /"protocols\[0\].type" must name the type/],
    [{ protocols: [{ ...session, open: [] }] }, /"protocols\[0\].open" must be a non-empty array/],
    [
      { protocols: [{ ...session, close: 'commit' }] },
      /"protocols\[0\].close" must be a non-empty/,
    ],
    [{ protocols: [{ ...session, steps: [''] }] }, /"protocols\[0\].steps" must be a non-empty/],
    [{ protocols: [{ ...session, reason: '' }] }, /"protocols\[0\].reason" must be a non-empty/],
    [{ protocols: [{ ...session, reason: 3 }] }, /"protocols\[0\].reason" must be a non-empty/],
    [{ protocols: [session, { ...session, close: ['end'] }] }, /"protocols\[1\].type" repeats/],
  ])('rejects %j', (config, message) => {
    expect(() => validateConfig(config)).toThrow(message);
  });

  it.each(PRESETS.filter(runsProtocols))('accepts protocols with the %s preset', (preset) => {
    expect(validateConfig({ preset, protocols: [session] })).toEqual({
      preset,
      protocols: [session],
    });
  });

  it.each(PRESETS.filter((preset) => !runsProtocols(preset)))(
    'rejects protocols with the %s preset, which does not run protocol-contract yet',
    (preset) => {
      expect(() => validateConfig({ preset, protocols: [session] })).toThrow(
        `"protocols" is not supported with "preset": "${preset}"`,
      );
    },
  );

  it('hands the contracts to the analyzers in the head policy', () => {
    expect(resolveHeadPolicy({ protocols: [session] }).protocols).toEqual([session]);
  });
});
