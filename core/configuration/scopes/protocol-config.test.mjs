import { describe, expect, it } from 'vitest';
import { resolveHeadPolicy } from '../../../shared/head-policy.mjs';
import { validateConfig } from '../validate.mjs';
import { looseningKindOfSetting } from '../../policy-changes/loosenings.mjs';

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
    [{ protocols: [{ ...session, reason: '' }] }, /"protocols\[0\].reason" must be a non-empty/],
    [{ protocols: [{ ...session, reason: 3 }] }, /"protocols\[0\].reason" must be a non-empty/],
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

  const withSteps = { ...session, steps: ['write', 'flush'] };

  it.each([
    [[session], [], true],
    [[session], [{ ...session, type: 'Lock' }], true],
    [[session], [{ ...session, close: ['commit', 'rollback', 'abandon'] }], true],
    [[{ ...session, open: ['begin', 'resume'] }], [session], true],
    [[withSteps], [{ ...withSteps, steps: ['write'] }], true],
    [[], [session], false],
    [[session], [session, { ...session, type: 'Lock' }], false],
    [[session], [{ ...session, close: ['commit'] }], false],
    [[session], [{ ...session, open: ['begin', 'resume'] }], false],
    [[session], [withSteps], false],
    [[session], [{ ...session, reason: 'one owner' }], false],
    [[session, { ...session, type: 'Lock' }], [{ ...session, type: 'Lock' }, session], false],
  ])('treats %j -> %j as a loosening: %s', (before, after, loosens) => {
    const kind = looseningKindOfSetting({ setting: 'protocols', before, after }, {});
    expect(kind).toBe(loosens ? 'protocols-loosened' : undefined);
  });
});
