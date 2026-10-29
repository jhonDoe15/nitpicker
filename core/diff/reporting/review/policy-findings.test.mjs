import { describe, expect, it } from 'vitest';
import { POLICY_GUIDANCE, policyKindGuidance } from './policy-guidance.mjs';
import { isPolicyChangeAccepted, policyDigest, policyFindings } from './policy-findings.mjs';

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

  it('explains the exclusion before the self-contained acceptance route', () => {
    const kinds = { 'exclude added: src/**': 'exclusion' };
    const [finding] = policyFindings(loosenings, 'd1e2f3a4b5c6', { kinds });

    expect(finding.policyKind).toBe('exclusion');
    expect(finding.message).toBe(
      [
        `exclude added: src/**. ${POLICY_GUIDANCE.exclusion}`,
        'If the policy change is intended, stop and ask a person reviewing this change:',
        'only they accept exactly these loosenings, with --accept-policy-change=d1e2f3a4b5c6',
        'at an interactive terminal or NITPICKER_ACCEPT_POLICY_CHANGE=d1e2f3a4b5c6 in CI.',
      ].join(' '),
    );
  });

  it('words a finding without a kind with the generic guidance and keeps its identity', () => {
    const [, finding] = policyFindings(loosenings, 'd1e2f3a4b5c6');

    expect(finding.policyKind).toBeUndefined();
    expect(finding.identity).toBe('analyzer disabled: mutation');
    expect(finding.message).toContain(policyKindGuidance(undefined));
  });

  it('accepts only the digest the run computed', () => {
    expect(policyFindings(loosenings, 'd1e2f3a4b5c6', { acceptedDigest: 'd1e2f3a4b5c6' })).toEqual(
      [],
    );
    expect(
      policyFindings(loosenings, 'd1e2f3a4b5c6', { acceptedDigest: 'ffffffffffff' }),
    ).toHaveLength(2);
    expect(isPolicyChangeAccepted([], 'd1e2f3a4b5c6', 'd1e2f3a4b5c6')).toBe(false);
    expect(isPolicyChangeAccepted(loosenings, 'd1e2f3a4b5c6', undefined)).toBe(false);
  });
});
