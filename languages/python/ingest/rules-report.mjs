import { describeRuleFinding, RULES_TOOL } from '../rules/rule-hints.mjs';
import { createIdentities } from './identities.mjs';

export function ingestRulesReport(text) {
  const identify = createIdentities();
  return JSON.parse(text).map(({ rule, path, subject, line, data }) => ({
    tool: RULES_TOOL,
    rule,
    path,
    identity: identify({ path, rule, subject }),
    message: describeRuleFinding(rule, subject, data),
    classification: 'enforceable',
    location: { line },
  }));
}
