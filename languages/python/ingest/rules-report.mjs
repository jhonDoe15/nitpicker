import { describeRuleFinding, RULES_TOOL } from '../rules/rule-hints.mjs';
import { createIdentities } from './identities.mjs';

export function ingestRulesReport(text, libraries) {
  const identify = createIdentities();
  return JSON.parse(text).map(({ rule, path, subject, line }) => ({
    tool: RULES_TOOL,
    rule,
    path,
    identity: identify({ path, rule, subject }),
    subject,
    message: describeRuleFinding(rule, subject, libraries),
    classification: 'enforceable',
    location: { line },
  }));
}
