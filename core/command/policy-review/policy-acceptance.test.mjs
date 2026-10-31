import { describe, expect, it } from 'vitest';
import { parseArguments } from '../arguments.mjs';
import { policyAcceptance } from './policy-acceptance.mjs';

const DIGEST = '0a1b2c3d4e5f';
const variable = (value, ci) => ({
  NITPICKER_ACCEPT_POLICY_CHANGE: value,
  ...(ci === undefined ? {} : { CI: ci }),
});

describe('policyAcceptance', () => {
  it('honours the flag only at an interactive terminal and the variable only in CI', () => {
    const accepted = (options, environment, interactive) =>
      policyAcceptance(options, environment, interactive).acceptPolicyChange;

    expect([
      accepted({}, {}, true),
      accepted({ acceptPolicyChange: DIGEST }, {}, true),
      accepted({ acceptPolicyChange: DIGEST }, {}, false),
      accepted({}, variable(DIGEST, 'true'), false),
      accepted({}, variable(DIGEST), true),
      accepted({}, variable('', 'true'), false),
      accepted({ acceptPolicyChange: 'ffffffffffff' }, variable(DIGEST, 'true'), true),
    ]).toEqual([undefined, DIGEST, undefined, DIGEST, undefined, undefined, 'ffffffffffff']);
  });

  it('records which route was used and says why an acceptance was not honoured', () => {
    const fromAgent = policyAcceptance({ acceptPolicyChange: DIGEST }, {}, false);
    const fromScript = policyAcceptance({}, variable(DIGEST), false);

    expect([fromAgent.policyAcceptanceSource, fromScript.policyAcceptanceSource]).toEqual([
      'flag',
      'environment',
    ]);
    expect([fromAgent.ignoredAcceptance, fromScript.ignoredAcceptance]).toEqual([
      '--accept-policy-change is honoured only at an interactive terminal, where a person reviews the change; in CI a person sets NITPICKER_ACCEPT_POLICY_CHANGE instead.',
      'NITPICKER_ACCEPT_POLICY_CHANGE is honoured only in CI (CI set); at a terminal a person passes --accept-policy-change instead.',
    ]);
    expect(policyAcceptance({}, {}, true)).toEqual({
      acceptPolicyChange: undefined,
      ignoredAcceptance: undefined,
      reportsPolicy: true,
    });
  });

  it('reports the policy findings from the first shard only', () => {
    expect(policyAcceptance({ shardIndex: 0 }, {}).reportsPolicy).toBe(true);
    expect(policyAcceptance({ shardIndex: 1 }, {}).reportsPolicy).toBe(false);
  });

  it('reads the digest from the command line', () => {
    expect(
      policyAcceptance(parseArguments([`--accept-policy-change=${DIGEST}`]), {}, true)
        .acceptPolicyChange,
    ).toBe(DIGEST);
  });

  it.each(['--accept-policy-change', '--accept-policy-change='])(
    'rejects %s without a digest',
    (argument) => {
      expect(() => parseArguments([argument])).toThrow(
        'takes the digest that the policy-loosened finding names: --accept-policy-change=<digest>',
      );
    },
  );
});
