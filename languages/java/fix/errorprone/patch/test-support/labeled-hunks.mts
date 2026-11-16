import type { LabeledHunk } from '../select-hunks.mts';
import { parseUnifiedDiff } from '../unified-diff.mts';

export function labeledHunk(label: string, body: string, header: string): LabeledHunk {
  const hunk = parseUnifiedDiff(`--- a\n+++ a\n${header}\n${body}`)[0]?.hunks[0];
  if (hunk === undefined) {
    throw new Error('the test patch has no hunk');
  }
  return { label, hunk };
}
