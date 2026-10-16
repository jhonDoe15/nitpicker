import { describe, expect, it } from 'vitest';
import { isPolicyChangeAccepted, policyDigest, policyFindings } from './policy-findings.mjs';

const loosenings = ['exclude added: src/vendor/**', 'analyzer disabled: mutation'];

describe('policyFindings', () => {
  it('names the digest of the loosenings in the acceptance route', () => {
    const digest = policyDigest(loosenings);

    expect(digest).toMatch(/^[0-9a-f]{12}$/u);
    expect(policyDigest(loosenings.toReversed())).toBe(digest);
    expect(policyFindings(loosenings, undefined).map(({ message }) => message)).toEqual(
      loosenings.map(
        (change) =>
          `${change}. Stop and ask a person to review this change; they accept exactly these ` +
          `loosenings with --accept-policy-change=${digest} (or NITPICKER_ACCEPT_POLICY_CHANGE=${digest} in CI).`,
      ),
    );
  });

  it('accepts only the digest of the same loosenings', () => {
    const accepted = policyDigest(loosenings);
    const later = [...loosenings, 'threshold fileLines raised from 300 to 500'];

    expect(isPolicyChangeAccepted(loosenings, accepted)).toBe(true);
    expect(policyFindings(loosenings, accepted)).toEqual([]);
    expect(isPolicyChangeAccepted(later, accepted)).toBe(false);
    expect(policyFindings(later, accepted)).toHaveLength(3);
    expect(isPolicyChangeAccepted(loosenings, '1')).toBe(false);
    expect(isPolicyChangeAccepted([], policyDigest([]))).toBe(false);
  });
});
