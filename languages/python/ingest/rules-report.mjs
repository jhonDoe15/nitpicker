import { describeRuleFinding, RULES_TOOL } from '../rules/rule-hints.mjs';
import { createIdentities } from './identities.mjs';

const SKIPPED_RULE = 'rules-skipped';

function skippedMessage(subject) {
  const checks = subject === 'file' ? 'the per-file checks' : `the ${subject} checks`;
  return `python-rules skipped ${checks} here: an expression nests too deeply for Python's recursion limit. Split the expression to have it checked.`;
}

export function ingestRulesReport(text) {
  const identify = createIdentities();
  return JSON.parse(text).map(({ rule, path, subject, line, data }) => {
    const skipped = rule === SKIPPED_RULE;
    return {
      tool: RULES_TOOL,
      rule,
      path,
      identity: identify({ path, rule, subject }),
      message: skipped ? skippedMessage(subject) : describeRuleFinding(rule, subject, data),
      classification: skipped ? 'descriptive' : 'enforceable',
      location: { line },
    };
  });
}
