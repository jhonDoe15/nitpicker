const SUPPORT_FOLDERS = new Set([
  'tests',
  'test',
  'testing',
  'test_support',
  'test-support',
  'test_utils',
  'test_helpers',
  'testutils',
  'test_fixtures',
  'fixtures',
  '__fixtures__',
  'mocks',
  '__mocks__',
]);
const SUPPORT_FILES = new Set(['conftest.py', 'testing.py', 'testutils.py', 'fixtures.py']);
const SECURITY_RULE = /^S\d/u;

export const SECURITY_RULES = [
  'sql-string-formatting',
  'tls-verification-off',
  'weak-hmac',
  'http-without-timeout',
  'unsafe-deserialization',
];

export function isTestSupportPath(file) {
  const parts = file.split('/');
  return (
    SUPPORT_FILES.has(parts.at(-1) ?? '') ||
    parts.slice(0, -1).some((part) => SUPPORT_FOLDERS.has(part))
  );
}

export function isSecurityFinding({ tool, rule }) {
  return tool === 'ruff' ? SECURITY_RULE.test(rule) : SECURITY_RULES.includes(rule);
}

export function isSupportSecurityFinding(finding) {
  return isSecurityFinding(finding) && isTestSupportPath(finding.path ?? '');
}
