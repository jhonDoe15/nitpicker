const SECURITY_RULE = /^S\d/u;

export const SECURITY_RULES = [
  'sql-string-formatting',
  'tls-verification-off',
  'weak-hmac',
  'http-without-timeout',
  'unsafe-deserialization',
];

export function isSecurityFinding({ tool, rule }) {
  return tool === 'ruff' ? SECURITY_RULE.test(rule) : SECURITY_RULES.includes(rule);
}

export function isSupportSecurityFinding(finding, supportFiles = new Set()) {
  return isSecurityFinding(finding) && supportFiles.has(finding.path ?? '');
}
