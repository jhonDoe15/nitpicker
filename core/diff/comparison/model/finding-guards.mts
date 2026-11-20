import type { AnchoredFinding, RatchetedFinding, TrackedFinding } from './finding-types.mts';

export function isRatcheted(finding: TrackedFinding): finding is RatchetedFinding {
  return finding.ratchet !== undefined;
}

export function isAnchored(finding: TrackedFinding): finding is AnchoredFinding {
  return finding.anchor !== undefined;
}
