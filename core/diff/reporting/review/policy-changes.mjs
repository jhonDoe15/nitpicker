import { isPolicyFinding, policyChangeGuidance } from './policy-findings.mjs';

const HEADING = 'Policy changed in this change (nitpicker.config.json, head against base):';
const ACCEPTED_HEADING =
  'Policy changed in this change (nitpicker.config.json, head against base; loosening accepted by exact digest):';

export function policyChangeSection(summary = {}) {
  const policyChanges = summary.policyChanges ?? [];
  const heading = summary.policyChangeAccepted === true ? ACCEPTED_HEADING : HEADING;
  return policyChanges.length === 0
    ? []
    : ['', heading, ...policyChanges.map((change) => `  ${change}`)];
}

export function appendPolicyChangeSummary(lines, summary, emphasize) {
  const [, heading, ...changes] = policyChangeSection(summary);
  if (heading !== undefined) {
    lines.push(emphasize(heading), ...changes);
  }
}

export function consolePolicySummary(report) {
  const findings = report.newFindings.filter(isPolicyFinding);
  const summary = report.summary ?? {};
  const changes = summary.policyChanges ?? [];
  if (findings.length === 0) {
    return { ...summary, policyChanges: changes };
  }
  const pending = new Set(findings.map(({ identity }) => identity));
  const entries = findings.map(({ identity }) => `${identity}. ${policyChangeGuidance(identity)}`);
  const digest = summary.policyDigest;
  return {
    ...summary,
    policyChangeAccepted: false,
    policyChanges: [
      ...entries,
      ...changes.filter((change) => !pending.has(change)),
      `Unapproved policy changes: ${String(findings.length)} (failing; separate from code violations).`,
      'Correct unintended changes first using the guidance above. For intended changes, ask a person reviewing this change to verify the affected checks and scope.',
      ...(digest === undefined
        ? []
        : [
            `Review digest: ${digest}`,
            'Only a person may accept this exact digest: pass --accept-policy-change=<digest> at an interactive terminal, or set NITPICKER_ACCEPT_POLICY_CHANGE=<digest> in CI and rerun.',
          ]),
    ],
  };
}
