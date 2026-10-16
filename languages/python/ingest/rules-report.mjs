import { describeRuleFinding, RULES_TOOL } from '../rules/rule-hints.mjs';
import { createIdentities } from './identities.mjs';

export function ingestRulesReport(text, behaviors) {
  const identify = createIdentities();
  return JSON.parse(text).map(({ rule, path, subject, line }) => ({
    tool: RULES_TOOL,
    rule,
    path,
    identity: identify({ path, rule, subject }),
    message: describeRuleFinding(rule, subject, behaviors),
    classification: 'enforceable',
    location: { line },
  }));
}
