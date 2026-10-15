import { describe, expect, it } from 'vitest';
import { parseArguments } from '../arguments.mjs';
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

  it('reads the flag from the command line', () => {
    expect(
      [[], ['--accept-policy-change']].map((arguments_) =>
        policyAcceptance(parseArguments(arguments_), {}),
      ),
    ).toEqual([
      { acceptPolicyChange: false, reportsPolicy: true },
      { acceptPolicyChange: true, reportsPolicy: true },
    ]);
  });
});
