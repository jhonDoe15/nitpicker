import { createHash } from 'node:crypto';
import type { Finding, ReportEntry } from '../../../../shared/values/findings.mts';
import { textOf } from '../../../../shared/values/readers.mts';
import { printable } from '../format/text.mts';
import { policyKindGuidance } from './policy-guidance.mts';

const POLICY_TOOL = 'nitpicker-config';
const POLICY_RULE = 'policy-loosened';
const DIGEST_LENGTH = 12;
const COMMIT_PREFIX = 'commit:';

export type PolicyAcceptance = {
  readonly acceptedDigest?: string | undefined;
  readonly headSha?: string | undefined;
};

export type PolicyFindingOptions = PolicyAcceptance & {
  readonly kinds?: Readonly<Record<string, string>> | undefined;
};

function byCodeUnit(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function policyDigest({
  loosenings,
  files = [],
}: {
  readonly loosenings: readonly string[];
  readonly files?: readonly (readonly string[])[] | undefined;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        loosenings: loosenings.toSorted(byCodeUnit),
        files: files.toSorted((left, right) => byCodeUnit(left.join(','), right.join(','))),
      }),
    )
    .digest('hex')
    .slice(0, DIGEST_LENGTH);
}

function acceptedCommit(acceptance: string | undefined): string | undefined {
  return acceptance?.startsWith(COMMIT_PREFIX) ? acceptance.slice(COMMIT_PREFIX.length) : undefined;
}

function acceptsThisRun(acceptance: string, digest: string, headSha: string | undefined): boolean {
  const commit = acceptedCommit(acceptance);
  return commit === undefined
    ? acceptance.split(',').includes(digest)
    : headSha !== undefined && commit === headSha;
}

export function isPolicyChangeAccepted(
  loosenings: readonly string[],
  digest: string,
  { acceptedDigest, headSha }: PolicyAcceptance = {},
): boolean {
  return (
    loosenings.length > 0 &&
    acceptedDigest !== undefined &&
    acceptsThisRun(acceptedDigest, digest, headSha)
  );
}

function mismatchNote(acceptance: string | undefined, headSha: string | undefined): string {
  const commit = acceptedCommit(acceptance);
  return commit === undefined
    ? ''
    : ` The acceptance names commit ${printable(commit)}, but the gated head is ${textOf(headSha)}` +
        ' (uncommitted changes make a new head), so it accepts nothing here.';
}

function acceptRoute(digest: string): string {
  return (
    'If the policy change is intended, stop and ask a person reviewing this change: only they accept ' +
    `exactly these loosenings, with --accept-policy-change=${digest} at an interactive terminal, ` +
    `NITPICKER_ACCEPT_POLICY_CHANGE=${digest} in CI, or the accept-policy-change label ` +
    'of a GitHub pull request, with the nitpicker approval workflow.'
  );
}

export function policyFindings(
  loosenings: readonly string[],
  digest: string,
  options: PolicyFindingOptions = {},
): Finding[] {
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

export function isPolicyFinding(finding: ReportEntry): boolean {
  return finding.tool === POLICY_TOOL && finding.rule === POLICY_RULE;
}

export const POLICY_FINDING_ID = `${POLICY_TOOL}/${POLICY_RULE}`;
