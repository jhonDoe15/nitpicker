import { MESSAGES, MINIMUM_BRANCH_COVERAGE, RULE_IDS, renderMessage } from '../policy.mjs';
import { positiveInteger } from './finding-helpers.mjs';
import { exceptionRoute } from '../exceptions/rule-names.mjs';

// Neutral input: `{ path, key, percent, line?, arms? }` per branch (or per line of branches), where
// `percent` is the share of its outcomes covered and `key` identifies its source text. Anything
// below `minimum` is an enforceable `changed-branch-coverage` finding; which branches are
// *changed* is the differential gate's job.
//
// `symbol` (optional) is the display name of the function the branch is in; with it the message
// names the per-function exception that accepts the branch, without it the `exclude` route.
//
// `arms` (optional) names the outcomes no test took, e.g. `the false arm of the ?: at 3:28`.
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
      message: `${branchMessage(branch, minimum)} ${acceptSentence(branch)}`,
      classification: 'enforceable',
      ...(isNamed(branch) ? { symbol: branch.symbol } : {}),
      ...(positiveInteger(branch.line) === undefined ? {} : { location: { line: branch.line } }),
    });
  }
  return findings;
}

function branchMessage(branch, minimum) {
  const message = renderMessage(MESSAGES.changedBranchCoverage, {
    percent: branch.percent.toFixed(2),
    minimum,
  });
  if (!Array.isArray(branch.arms) || branch.arms.length === 0) {
    return `${message}.`;
  }
  return `${message}. Not taken: ${branch.arms.join('; ')}. Test it, or remove it if it can't happen.`;
}

function isNamed(branch) {
  return typeof branch.symbol === 'string' && branch.symbol !== '';
}

function acceptSentence(branch) {
  return isNamed(branch)
    ? exceptionRoute({
        rule: RULE_IDS.changedBranchCoverage,
        path: branch.path,
        name: branch.symbol,
      })
    : 'To accept the file, add it to "exclude" in nitpicker.config.json.';
}
