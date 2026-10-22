import { createHash } from 'node:crypto';
import { printable } from '../format/text.mjs';
import { policyKindGuidance } from './policy-guidance.mjs';

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

export function policyFindings(loosenings, digest, acceptedDigest, kinds = {}) {
  if (isPolicyChangeAccepted(loosenings, digest, acceptedDigest)) {
    return [];
  }
  const route = acceptRoute(digest);
  return loosenings.map((change) => ({
    tool: POLICY_TOOL,
    rule: POLICY_RULE,
    path: 'nitpicker.config.json',
    identity: change,
    message: `${printable(change)}. ${policyKindGuidance(kinds[change])} ${route}`,
    classification: 'enforceable',
    ...(kinds[change] === undefined ? {} : { policyKind: kinds[change] }),
  }));
}

export function isPolicyFinding(finding) {
  return finding.tool === POLICY_TOOL && finding.rule === POLICY_RULE;
}

export const POLICY_FINDING_ID = `${POLICY_TOOL}/${POLICY_RULE}`;
