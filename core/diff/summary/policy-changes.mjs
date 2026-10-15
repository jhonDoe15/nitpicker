const HEADING = 'Policy changed in this change (nitpicker.config.json, head against base):';

export function policyChangeSection(policyChanges = []) {
  return policyChanges.length === 0
    ? []
    : ['', HEADING, ...policyChanges.map((change) => `  ${change}`)];
}

export function appendPolicyChangeSummary(lines, policyChanges, emphasize) {
  const [, heading, ...changes] = policyChangeSection(policyChanges);
  if (heading !== undefined) {
    lines.push(emphasize(heading), ...changes);
  }
}
