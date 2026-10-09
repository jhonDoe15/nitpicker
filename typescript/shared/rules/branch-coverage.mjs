import { MESSAGES, MINIMUM_BRANCH_COVERAGE, RULE_IDS, renderMessage } from '../policy.mjs';

// Neutral input: `{ path, key, percent, line? }` per branch (or per line of branches), where
// `percent` is the share of its outcomes covered and `key` identifies its source text. Anything
// below `minimum` is an enforceable `changed-branch-coverage` finding; which branches are
// *changed* is the differential gate's job.
//
// Identity is the adapter's format (`identify(key, occurrence)`), but the occurrence number is
// counted here: the n-th *failing* branch with the same path and key gets n, so a covered twin
// does not shift it.

export function branchCoverageFindings(
  branches,
  { tool, identify, minimum = MINIMUM_BRANCH_COVERAGE },
) {
  const occurrences = new Map();
  const findings = [];
  for (const branch of branches) {
    if (branch.percent >= minimum) {
      continue;
    }
    const counterKey = `${branch.path}\0${branch.key}`;
    const occurrence = (occurrences.get(counterKey) ?? 0) + 1;
    occurrences.set(counterKey, occurrence);
    findings.push({
      tool,
      rule: RULE_IDS.changedBranchCoverage,
      path: branch.path,
      identity: identify(branch.key, occurrence),
      message: renderMessage(MESSAGES.changedBranchCoverage, {
        percent: branch.percent.toFixed(2),
        minimum,
      }),
      classification: 'enforceable',
      ...(Number.isInteger(branch.line) && branch.line > 0
        ? { location: { line: branch.line } }
        : {}),
    });
  }
  return findings;
}
