import { comparisonKey as comparisonKey } from '../../../../core/diff/comparison/fingerprint.mts';
import type { TrackedFinding } from '../../../../core/diff/comparison/model/finding-types.mts';

export function withoutDuplicateIdentities(
  findings: readonly TrackedFinding[],
  snapshot: string,
  warn: (message: string) => void,
): TrackedFinding[] {
  const seen = new Set<string>();
  const dropped = new Map<string, number>();
  const kept: TrackedFinding[] = [];
  for (const finding of findings) {
    const key = comparisonKey(finding);
    if (seen.has(key)) {
      const place = `${finding.tool}/${finding.rule} at ${finding.path}`;
      dropped.set(place, (dropped.get(place) ?? 0) + 1);
    } else {
      seen.add(key);
      kept.push(finding);
    }
  }
  for (const [place, count] of dropped) {
    const findingsText = count === 1 ? 'finding' : 'findings';
    warn(
      `${snapshot}: left ${String(count)} ${findingsText} of ${place} out of the comparison ` +
        'because each repeated the identity of another finding.',
    );
  }
  return kept;
}
