import { createHash } from 'node:crypto';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';

const POLICY_TOOL = 'nitpicker-config';
const POLICY_RULE = 'policy-loosened';
const DIGEST_LENGTH = 12;
const ALLOWED_FORM =
  "Keep the base's policy and change the code until it passes: keep new code under the source roots, where the gate checks it, and fix findings instead of excluding, excepting or reclassifying the code.";

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
    message: withTroubleshooting(
      `${change}. ${ALLOWED_FORM} ${route}`,
      TROUBLESHOOTING_ANCHORS.policyLoosened,
    ),
    classification: 'enforceable',
  }));
}
