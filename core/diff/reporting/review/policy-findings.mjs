import { createHash } from 'node:crypto';
import { printable } from '../format/text.mjs';
import { policyKindGuidance } from './policy-guidance.mjs';

const POLICY_TOOL = 'nitpicker-config';
const POLICY_RULE = 'policy-loosened';
const DIGEST_LENGTH = 12;
const COMMIT_PREFIX = 'commit:';

export function policyDigest({ loosenings, files = [] }) {
  return createHash('sha256')
    .update(JSON.stringify({ loosenings: loosenings.toSorted(), files: files.toSorted() }))
    .digest('hex')
    .slice(0, DIGEST_LENGTH);
}

function acceptedCommit(acceptance) {
  return acceptance?.startsWith(COMMIT_PREFIX) ? acceptance.slice(COMMIT_PREFIX.length) : undefined;
}

function acceptsThisRun(acceptance, digest, headSha) {
  const commit = acceptedCommit(acceptance);
  return commit === undefined
    ? acceptance.split(',').includes(digest)
    : headSha !== undefined && commit === headSha;
}

export function isPolicyChangeAccepted(loosenings, digest, { acceptedDigest, headSha } = {}) {
  return (
    loosenings.length > 0 &&
    acceptedDigest !== undefined &&
    acceptsThisRun(acceptedDigest, digest, headSha)
  );
}

function mismatchNote(acceptance, headSha) {
  const commit = acceptedCommit(acceptance);
  return commit === undefined
    ? ''
    : ` The acceptance names commit ${printable(commit)}, but the gated head is ${headSha}` +
        ' (uncommitted changes make a new head), so it accepts nothing here.';
}

function acceptRoute(digest) {
  return (
    'If the policy change is intended, stop and ask a person reviewing this change: only they accept ' +
    `exactly these loosenings, with --accept-policy-change=${digest} at an interactive terminal, ` +
    `NITPICKER_ACCEPT_POLICY_CHANGE=${digest} in CI, or the accept-policy-change label ` +
    'of a GitHub pull request, with the nitpicker approval workflow.'
  );
}

export function policyFindings(loosenings, digest, options = {}) {
  const { acceptedDigest, headSha, kinds = {} } = options;
  if (isPolicyChangeAccepted(loosenings, digest, { acceptedDigest, headSha })) {
    return [];
  }
  const route = `${acceptRoute(digest)}${mismatchNote(acceptedDigest, headSha)}`;
  return loosenings.map((change) => ({
    tool: POLICY_TOOL,
    rule: POLICY_RULE,
    path: 'nitpicker.config.json',
    identity: change,
    message: `${printable(change)}. ${policyKindGuidance(kinds[change])} ${route}`,
    allowedForm: policyKindGuidance(kinds[change]),
    classification: 'enforceable',
    ...(kinds[change] === undefined ? {} : { policyKind: kinds[change] }),
  }));
}

export function isPolicyFinding(finding) {
  return finding.tool === POLICY_TOOL && finding.rule === POLICY_RULE;
}

export const POLICY_FINDING_ID = `${POLICY_TOOL}/${POLICY_RULE}`;
