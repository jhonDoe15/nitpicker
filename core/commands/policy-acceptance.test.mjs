import { describe, expect, it } from 'vitest';
import { policyAcceptance } from './policy-acceptance.mjs';

describe('policyAcceptance', () => {
  it('accepts a policy change from the flag or the environment variable', () => {
    expect(policyAcceptance({ acceptPolicyChange: false }, {})).toEqual({
      acceptPolicyChange: false,
      reportsPolicy: true,
    });
    expect(policyAcceptance({ acceptPolicyChange: true }, {})).toEqual({
      acceptPolicyChange: true,
      reportsPolicy: true,
    });
    expect(
      policyAcceptance({ acceptPolicyChange: false }, { NITPICKER_ACCEPT_POLICY_CHANGE: '1' }),
    ).toEqual({ acceptPolicyChange: true, reportsPolicy: true });
    expect(
      policyAcceptance({ acceptPolicyChange: false }, { NITPICKER_ACCEPT_POLICY_CHANGE: 'yes' }),
    ).toEqual({ acceptPolicyChange: false, reportsPolicy: true });
  });

  it('reports the policy findings from the first shard only', () => {
    expect(policyAcceptance({ acceptPolicyChange: false, shardIndex: 0 }, {})).toEqual({
      acceptPolicyChange: false,
      reportsPolicy: true,
    });
    expect(policyAcceptance({ acceptPolicyChange: false, shardIndex: 1 }, {})).toEqual({
      acceptPolicyChange: false,
      reportsPolicy: false,
    });
  });
});
