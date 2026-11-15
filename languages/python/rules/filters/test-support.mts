const SECURITY_RULE = /^S\d/u;

export const SECURITY_RULES = [
  'sql-string-formatting',
  'tls-verification-off',
  'weak-hmac',
  'http-without-timeout',
  'client-without-timeout',
  'unsafe-deserialization',
];

export function isSecurityFinding({ tool, rule }: { tool: string; rule: string }): boolean {
  return tool === 'ruff' ? SECURITY_RULE.test(rule) : SECURITY_RULES.includes(rule);
}

export function isSupportSecurityFinding(
  finding: { tool: string; rule: string; path?: string | undefined },
  supportFiles: ReadonlySet<string> = new Set(),
): boolean {
  return isSecurityFinding(finding) && supportFiles.has(finding.path ?? '');
}
