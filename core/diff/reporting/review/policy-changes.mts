import { printable } from '../format/text.mjs';
import { POLICY_FINDING_ID, isPolicyFinding } from './policy-findings.mjs';
import { policyKindGuidance } from './policy-guidance.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../../shared/values/readers.mts';

type Emphasize = (text: string) => string;

type PolicyReport = { readonly summary?: unknown; readonly newFindings: readonly ReportEntry[] };

const printed: (value: unknown) => string = printable;
const isPolicyEntry: (finding: ReportEntry) => boolean = isPolicyFinding;
const guidanceFor: (kind: unknown) => string = policyKindGuidance;
const POLICY_ID: string = POLICY_FINDING_ID;

const HEADING = 'Policy changed in this change (nitpicker.config.json, head against base):';
const ACCEPTED_HEADING =
  'Policy changed in this change (nitpicker.config.json, head against base; loosening accepted):';
const GUIDANCE_INDENT = 2;

function indentedLine(change: unknown): string {
  const { text, indent } =
    typeof change === 'string'
      ? { text: change, indent: 0 }
      : { text: fieldOf(change, 'text'), indent: Number(fieldOf(change, 'indent')) };
  return `${' '.repeat(2 + indent)}${printed(text)}`;
}

export function policyChangeSection(summary: unknown = {}): string[] {
  const policyChanges = listOf(fieldOf(summary, 'policyChanges'));
  const heading = fieldOf(summary, 'policyChangeAccepted') === true ? ACCEPTED_HEADING : HEADING;
  return policyChanges.length === 0 ? [] : ['', heading, ...policyChanges.map(indentedLine)];
}

export function appendPolicyChangeSummary(
  lines: string[],
  summary: unknown,
  emphasize: Emphasize,
): void {
  const [, heading, ...changes] = policyChangeSection(summary);
  if (heading !== undefined) {
    lines.push(emphasize(heading), ...changes);
  }
}

function groupedByKind(findings: readonly ReportEntry[]): [unknown, unknown[]][] {
  const groups = new Map<unknown, unknown[]>();
  for (const { identity, policyKind } of findings) {
    groups.set(policyKind, [...(groups.get(policyKind) ?? []), identity]);
  }
  return [...groups];
}

function acceptanceLine(digest: unknown): string {
  const digestText = textOf(digest);
  return textOf(
    withTroubleshooting(
      'Only a person may accept exactly these changes, after reviewing them: ' +
        `--accept-policy-change=${digestText} at an interactive terminal, ` +
        `NITPICKER_ACCEPT_POLICY_CHANGE=${digestText} in CI, ` +
        'or the accept-policy-change label of a GitHub pull request, with the nitpicker approval workflow.',
      TROUBLESHOOTING_ANCHORS.policyLoosened,
    ),
  );
}

export function consolePolicySummary(report: PolicyReport): Readonly<Record<string, unknown>> {
  const findings = report.newFindings.filter(isPolicyEntry);
  const summary = fieldsOf(report.summary);
  const changes = listOf(summary['policyChanges']);
  if (findings.length === 0) {
    return { ...summary, policyChanges: changes };
  }
  const pending = new Set(findings.map(({ identity }) => identity));
  const digest = summary['policyDigest'];
  return {
    ...summary,
    policyChangeAccepted: false,
    policyChanges: [
      ...groupedByKind(findings).flatMap(([kind, identities]) => [
        ...identities,
        { text: guidanceFor(kind), indent: GUIDANCE_INDENT },
      ]),
      ...changes.filter((change) => !pending.has(change)),
      `Unapproved policy changes (${POLICY_ID}): ${String(findings.length)}; ` +
        'the gate fails until each is undone or a person accepts the digest.',
      ...(digest === undefined ? [] : [acceptanceLine(digest)]),
    ],
  };
}
