import { coChangeFindings } from './findings.mts';
import { projectEvidence } from './project-evidence.mts';
import type { PathFinding } from '../../hygiene/check-types.mts';
import { isReady, type HistoryPolicy } from '../typed/history-types.mts';

export function collectChangeHistoryFindings({
  projectRoot,
  ref,
  policy,
}: {
  readonly projectRoot: string;
  readonly ref?: string | undefined;
  readonly policy: HistoryPolicy;
}): PathFinding[] {
  const evidence = projectEvidence({ projectRoot, ref, policy });
  return evidence.enabled && isReady(evidence)
    ? coChangeFindings({ pairs: evidence.pairs, used: evidence.used })
    : [];
}
