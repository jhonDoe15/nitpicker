import { comparisonKey as untypedComparisonKey } from '../../../../core/diff/comparison/fingerprint.mjs';
import type { JavaFinding } from '../typed/java-values.mts';

const comparisonKey: (finding: JavaFinding) => string = untypedComparisonKey;

export function withoutDuplicateIdentities(
  findings: readonly JavaFinding[],
  snapshot: string,
  warn: (message: string) => void,
): JavaFinding[] {
  const seen = new Set<string>();
  const dropped = new Map<string, number>();
  const kept: JavaFinding[] = [];
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
