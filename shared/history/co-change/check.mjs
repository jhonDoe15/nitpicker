import { coChangeFindings } from './findings.mjs';
import { projectEvidence } from './project-evidence.mjs';

export function collectChangeHistoryFindings({ projectRoot, ref, policy }) {
  const evidence = projectEvidence({ projectRoot, ref, policy });
  return evidence.enabled && evidence.history.available
    ? coChangeFindings({ pairs: evidence.pairs, used: evidence.used })
    : [];
}
