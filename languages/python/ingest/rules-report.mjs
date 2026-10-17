import { describeRuleFinding, RULES_TOOL } from '../rules/rule-hints.mjs';
import { createIdentities } from './identities.mjs';

const CHECK_FAILED_RULE = 'rules-check-failed';
const SKIPPED_RULE = 'rules-skipped';
const MINIMUM_PYTHON = '3.10';

function toolError({ rule, path, subject, error }) {
  const message =
    rule === SKIPPED_RULE
      ? `The python-rules checks did not run: they need Python ${MINIMUM_PYTHON} or newer, and the project environment runs Python ${subject}. Point "python.environment" at a Python ${MINIMUM_PYTHON} or newer environment.`
      : `The python-rules check ${subject} failed on ${path} (${error}), so that file has no ${subject} findings; the other checks and files ran. Report it as a nitpicker bug with the file.`;
  return {
    tool: RULES_TOOL,
    rule,
    path,
    identity: rule === SKIPPED_RULE ? rule : `${rule}:${subject}`,
    message,
    classification: 'tool-error',
  };
}

export function ingestRulesReport(text, libraries) {
  const identify = createIdentities();
  return JSON.parse(text).map(({ rule, path, subject, line, error }) => {
    if (rule === CHECK_FAILED_RULE || rule === SKIPPED_RULE) {
      return toolError({ rule, path, subject, error });
    }
    return {
      tool: RULES_TOOL,
      rule,
      path,
      identity: identify({ path, rule, subject }),
      subject,
      message: describeRuleFinding(rule, subject, libraries),
      classification: 'enforceable',
      location: { line },
    };
  });
}
