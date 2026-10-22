import { describe, expect, it } from 'vitest';
import { resolveHeadPolicy } from '../../../shared/head-policy.mjs';
import { validateConfig } from '../validate.mjs';
import { loosensSetting } from '../../policy-changes/loosenings.mjs';

const session = { type: 'Session', open: ['begin'], close: ['commit', 'rollback'] };

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
    [
      { preset: 'python', protocols: [session] },
      /"protocols" is not supported with "preset": "python"/,
    ],
  ])('rejects %j', (config, message) => {
    expect(() => validateConfig(config)).toThrow(message);
  });

  it('hands the contracts to the analyzers in the head policy', () => {
    expect(resolveHeadPolicy({ protocols: [session] }).protocols).toEqual([session]);
  });

  it.each([
    [[session], [], true],
    [[session], [{ ...session, close: ['commit', 'rollback', 'abandon'] }], true],
    [[], [session], false],
    [[session], [session, { ...session, type: 'Lock' }], false],
  ])('treats %j -> %j as a loosening: %s', (before, after, loosens) => {
    expect(loosensSetting({ setting: 'protocols', before, after }, {})).toBe(loosens);
  });
});
