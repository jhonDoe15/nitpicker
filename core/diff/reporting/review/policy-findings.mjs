import { createHash } from 'node:crypto';

const POLICY_TOOL = 'nitpicker-config';
const POLICY_RULE = 'policy-loosened';
const DIGEST_LENGTH = 12;

export function policyDigest({ loosenings, files = [] }) {
  return createHash('sha256')
    .update(JSON.stringify({ loosenings: loosenings.toSorted(), files: files.toSorted() }))
    .digest('hex')
    .slice(0, DIGEST_LENGTH);
}

export function isPolicyChangeAccepted(loosenings, digest, acceptedDigest) {
  return loosenings.length > 0 && acceptedDigest !== undefined && acceptedDigest === digest;
}

function acceptRoute(digest) {
  return (
    'If the policy change is intended, stop and ask a person reviewing this change: only they accept ' +
    `exactly these loosenings, with --accept-policy-change=${digest} at an interactive terminal ` +
    `or NITPICKER_ACCEPT_POLICY_CHANGE=${digest} in CI.`
  );
}

export function policyFindings(loosenings, digest, acceptedDigest) {
  if (isPolicyChangeAccepted(loosenings, digest, acceptedDigest)) {
    return [];
  }
  const route = acceptRoute(digest);
  return loosenings.map((change) => ({
    tool: POLICY_TOOL,
    rule: POLICY_RULE,
    path: 'nitpicker.config.json',
    identity: change,
    message: `${change}. ${policyChangeGuidance(change)} ${route}`,
    classification: 'enforceable',
  }));
}

export function isPolicyFinding(finding) {
  return finding.tool === POLICY_TOOL && finding.rule === POLICY_RULE;
}

const CHANGE_GUIDANCE = [
  [
    /^layout\.entryPoints added:/u,
    'Treats matching files as runtime entry points and public API roots for reachability and unused-export checks, and permits module-load effects and process access in those composition roots. A command or runtime may load a script without a static import; verify that invocation before review. Remove an unintended declaration; other checks still apply.',
  ],
  [
    /^python\.entryPoints added:/u,
    'Treats matching Python files as composition roots, exempting their process-environment access from process-env-access. Verify the command or runtime that loads the script before review. Remove an unintended declaration; other checks still apply.',
  ],
  [
    /^exception added:/u,
    'Suppresses findings for the named rule on matching paths, so newly covered code needs review. Remove or narrow an unintended exception and fix the rule findings.',
  ],
  [
    /^(?:exclude|layout\.excludedGlobs) added:/u,
    'Removes matching paths from analyzed scope and filters their findings, so newly hidden code needs review. Remove or narrow an unintended exclusion and fix the findings.',
  ],
  [
    /^duplicates\./u,
    'Changes the scope of duplicate-code analysis, so newly skipped code needs review. Restore the previous duplicate-analysis scope if unintended.',
  ],
  [
    /^analyzer (?:disabled|removed|changed):/u,
    'Changes which analyzer checks run or how they run, so lost protection needs review. Restore the previous analyzer configuration if unintended.',
  ],
  [
    /^threshold /u,
    'Allows a higher metric value before the gate fails, so the weaker limit needs review. Restore the previous threshold and reduce the metric if unintended.',
  ],
];

export function policyChangeGuidance(change) {
  return (
    CHANGE_GUIDANCE.find(([pattern]) => pattern.test(change))?.[1] ??
    'Changes the checking policy for affected code and requires review of the lost protection. Restore the base setting and fix the findings if unintended.'
  );
}
