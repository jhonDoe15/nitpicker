import { coChangeFindings } from './findings.mjs';
import { projectEvidence } from './project-evidence.mjs';

export function collectChangeHistoryFindings({ projectRoot, listFiles, policy }) {
  const evidence = projectEvidence({ projectRoot, listFiles, policy });
  return evidence.enabled && evidence.history.available
    ? coChangeFindings({ pairs: evidence.pairs, used: evidence.used })
    : [];
}
