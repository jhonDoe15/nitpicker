import { describe, expect, it } from 'vitest';
import { isPolicyChangeAccepted, policyDigest, policyFindings } from './policy-findings.mjs';
import { linkSentence } from '../../../../shared/messages/test-support/link-sentence.mjs';

describe('policy findings', () => {
  const loosenings = ['exclude added: src/**', 'analyzer disabled: mutation'];
  const files = [['nitpicker.config.json', 'a1']];

  it('hashes the loosenings with each implicated file and its content, in any order', () => {
    const digest = policyDigest({ loosenings, files });

    expect(digest).toMatch(/^[0-9a-f]{12}$/u);
    expect(policyDigest({ loosenings: loosenings.toReversed(), files })).toBe(digest);
    expect(policyDigest({ loosenings, files: [['nitpicker.config.json', 'b2']] })).not.toBe(digest);
    expect(policyDigest({ loosenings, files: [...files, ['src/later/zz.ts', 'c3']] })).not.toBe(
      digest,
    );
  });

  it('names the allowed form first and the acceptance route for a person second', () => {
    const [finding] = policyFindings(loosenings, 'd1e2f3a4b5c6', undefined);

    expect(finding.message).toBe(
      "exclude added: src/**. Keep the base's policy and change the code until it passes: keep new code under the source roots, where the gate checks it, and fix findings instead of excluding, excepting or reclassifying the code. " +
        'If the policy change is intended, stop and ask a person reviewing this change: only they accept exactly these loosenings, with --accept-policy-change=d1e2f3a4b5c6 at an interactive terminal or NITPICKER_ACCEPT_POLICY_CHANGE=d1e2f3a4b5c6 in CI. ' +
        linkSentence('policyLoosened'),
    );
  });

  it('accepts only the digest the run computed', () => {
    expect(policyFindings(loosenings, 'd1e2f3a4b5c6', 'd1e2f3a4b5c6')).toEqual([]);
    expect(policyFindings(loosenings, 'd1e2f3a4b5c6', 'ffffffffffff')).toHaveLength(2);
    expect(isPolicyChangeAccepted([], 'd1e2f3a4b5c6', 'd1e2f3a4b5c6')).toBe(false);
    expect(isPolicyChangeAccepted(loosenings, 'd1e2f3a4b5c6', undefined)).toBe(false);
  });
});
