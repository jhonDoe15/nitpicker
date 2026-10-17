const HEADING = 'Policy changed in this change (nitpicker.config.json, head against base):';
const ACCEPTED_HEADING =
  'Policy changed in this change (nitpicker.config.json, head against base; loosening accepted with --accept-policy-change):';

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
