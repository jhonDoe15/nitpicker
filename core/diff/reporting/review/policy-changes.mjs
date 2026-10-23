import { printable } from '../format/text.mjs';
import { POLICY_FINDING_ID, isPolicyFinding } from './policy-findings.mjs';
import { policyKindGuidance } from './policy-guidance.mjs';

const HEADING = 'Policy changed in this change (nitpicker.config.json, head against base):';
const ACCEPTED_HEADING =
  'Policy changed in this change (nitpicker.config.json, head against base; loosening accepted by exact digest):';
const GUIDANCE_INDENT = 2;

function indentedLine(change) {
  const { text, indent } = typeof change === 'string' ? { text: change, indent: 0 } : change;
  return `${' '.repeat(2 + indent)}${printable(text)}`;
}

export function policyChangeSection(summary = {}) {
  const policyChanges = summary.policyChanges ?? [];
  const heading = summary.policyChangeAccepted === true ? ACCEPTED_HEADING : HEADING;
  return policyChanges.length === 0 ? [] : ['', heading, ...policyChanges.map(indentedLine)];
}

export function appendPolicyChangeSummary(lines, summary, emphasize) {
  const [, heading, ...changes] = policyChangeSection(summary);
  if (heading !== undefined) {
    lines.push(emphasize(heading), ...changes);
  }
}

function groupedByKind(findings) {
  const groups = new Map();
  for (const { identity, policyKind } of findings) {
    groups.set(policyKind, [...(groups.get(policyKind) ?? []), identity]);
  }
  return [...groups];
}

function acceptanceLine(digest) {
  return (
    'Only a person may accept exactly these changes, after reviewing them: ' +
    `--accept-policy-change=${digest} at an interactive terminal, ` +
    `or NITPICKER_ACCEPT_POLICY_CHANGE=${digest} in CI.`
  );
}

export function consolePolicySummary(report) {
  const findings = report.newFindings.filter(isPolicyFinding);
  const summary = report.summary ?? {};
  const changes = summary.policyChanges ?? [];
  if (findings.length === 0) {
    return { ...summary, policyChanges: changes };
  }
  const pending = new Set(findings.map(({ identity }) => identity));
  const digest = summary.policyDigest;
  return {
    ...summary,
    policyChangeAccepted: false,
    policyChanges: [
      ...groupedByKind(findings).flatMap(([kind, identities]) => [
        ...identities,
        { text: policyKindGuidance(kind), indent: GUIDANCE_INDENT },
      ]),
      ...changes.filter((change) => !pending.has(change)),
      `Unapproved policy changes (${POLICY_FINDING_ID}): ${String(findings.length)}; ` +
        'the gate fails until each is undone or a person accepts the digest.',
      ...(digest === undefined ? [] : [acceptanceLine(digest)]),
    ],
  };
}
