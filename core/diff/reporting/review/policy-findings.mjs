import { createHash } from 'node:crypto';

const POLICY_TOOL = 'nitpicker-config';
const POLICY_RULE = 'policy-loosened';
const DIGEST_LENGTH = 12;

export function policyDigest(loosenings) {
  return createHash('sha256')
    .update(JSON.stringify(loosenings.toSorted()))
    .digest('hex')
    .slice(0, DIGEST_LENGTH);
}

export function isPolicyChangeAccepted(loosenings, acceptedDigest) {
  return loosenings.length > 0 && acceptedDigest === policyDigest(loosenings);
}

function acceptRoute(digest) {
  return (
    'Stop and ask a person to review this change; they accept exactly these loosenings with ' +
    `--accept-policy-change=${digest} (or NITPICKER_ACCEPT_POLICY_CHANGE=${digest} in CI).`
  );
}

export function policyFindings(loosenings, acceptedDigest) {
  if (isPolicyChangeAccepted(loosenings, acceptedDigest)) {
    return [];
  }
  const route = acceptRoute(policyDigest(loosenings));
  return loosenings.map((change) => ({
    tool: POLICY_TOOL,
    rule: POLICY_RULE,
    path: 'nitpicker.config.json',
    identity: change,
    message: `${change}. ${route}`,
    classification: 'enforceable',
  }));
}
