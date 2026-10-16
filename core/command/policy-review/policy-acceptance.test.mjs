import { describe, expect, it } from 'vitest';
import { parseArguments } from '../arguments.mjs';
import { policyAcceptance } from './policy-acceptance.mjs';

describe('policyAcceptance', () => {
  it('takes the accepted digest from the flag, else from the environment variable', () => {
    const variable = (value) => ({ NITPICKER_ACCEPT_POLICY_CHANGE: value });

    expect(
      [
        policyAcceptance({}, {}),
        policyAcceptance({}, variable('')),
        policyAcceptance({}, variable('0a1b2c3d4e5f')),
        policyAcceptance({ acceptPolicyChange: 'ffffffffffff' }, variable('0a1b2c3d4e5f')),
      ].map(({ acceptPolicyChange }) => acceptPolicyChange),
    ).toEqual([undefined, undefined, '0a1b2c3d4e5f', 'ffffffffffff']);
  });

  it('reports the policy findings from the first shard only', () => {
    expect(policyAcceptance({ shardIndex: 0 }, {}).reportsPolicy).toBe(true);
    expect(policyAcceptance({ shardIndex: 1 }, {}).reportsPolicy).toBe(false);
  });

  it('reads the digest from the command line and rejects the flag without one', () => {
    expect(policyAcceptance(parseArguments(['--accept-policy-change=0a1b2c3d4e5f']), {})).toEqual({
      acceptPolicyChange: '0a1b2c3d4e5f',
      reportsPolicy: true,
    });
    for (const argument of ['--accept-policy-change', '--accept-policy-change=']) {
      expect(() => parseArguments([argument])).toThrow(
        'takes the digest that the policy-loosened finding names: --accept-policy-change=<digest>',
      );
    }
  });
});
