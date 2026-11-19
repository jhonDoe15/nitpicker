import type { Finding } from '../../../../../shared/values/findings.mts';

export function unusedRuleIds(message: string): string[] {
  const description =
    /^Unused eslint-disable directive \(no problems were reported from (.+)\)\.$/u.exec(
      message,
    )?.[1];
  return description === undefined
    ? []
    : [...description.matchAll(/'([^']+)'/gu)].flatMap(([, rule]) => rule ?? []);
}

export function unusedDirectiveMessage(rules: readonly string[]): string {
  const quoted = rules.toSorted().map((rule) => `'${rule}'`);
  const description =
    quoted.length <= 2
      ? quoted.join(' or ')
      : `${quoted.slice(0, -1).join(', ')}, or ${quoted.at(-1) ?? ''}`;
  return `Unused eslint-disable directive (no problems were reported from ${description}).`;
}

export function withUnusedRules(finding: Finding, rules: readonly string[]): Finding {
  const message = unusedDirectiveMessage(rules);
  return message === finding.message
    ? finding
    : {
        ...finding,
        message,
        identity: finding.identity.replace(finding.message, () => message),
      };
}
