import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const LDAP_ADVICE =
  'Escape the value for the filter: `from ldap3.utils.conv import escape_filter_chars` (or `ldap.filter.escape_filter_chars`) and write `f"(&(objectClass=person)(uid={escape_filter_chars(username)}))"`, or let `ldap.filter.filter_format("(uid=%s)", [username])` do it.';
const SCIM_ADVICE =
  'Put the value in double quotes and escape the quotes and backslashes in it, for example with `json.dumps(username)` or a small `scim_quote(value)` helper: `f"userName eq {json.dumps(username)}"`.';

function describe(subject: string): string {
  const [kind = 'ldap', ...rest] = subject.split('|');
  const value = rest.join('|');
  const language = kind === 'scim' ? 'a SCIM filter' : 'an LDAP search filter';
  return `\`${value}\` is put into ${language} as plain text, so a parenthesis, \`*\`, quote or backslash in it changes which entries match or makes the filter invalid`;
}

export const QUERY_FILTER_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['filter-unescaped-value'],
    describe,
    allowed: `${LDAP_ADVICE} For a SCIM filter: ${SCIM_ADVICE} A value that is a constant needs no escaping.`,
  },
];
