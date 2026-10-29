import { describeRuleFinding, RULES_TOOL } from '../rules/rule-hints.mjs';
import { createIdentities } from './identities.mjs';

const CHECK_FAILED_RULE = 'rules-check-failed';
const SKIPPED_RULE = 'rules-skipped';
const MINIMUM_PYTHON = '3.10';
const TOO_DEEP_RULE = 'rules-too-deep';
const TOO_DEEP_CHECKS = { file: 'some of the per-file checks', all: 'every check' };

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

function tooDeepMessage(subject) {
  const checks = TOO_DEEP_CHECKS[subject] ?? `the ${subject} checks`;
  return `python-rules skipped ${checks} here: an expression nests too deeply for Python's recursion limit. Split the expression to have it checked.`;
}

function described({ rule, subject, data }, libraries) {
  if (rule === TOO_DEEP_RULE) {
    return { message: tooDeepMessage(subject), classification: 'descriptive' };
  }
  return {
    message: describeRuleFinding(rule, subject, { libraries, data }),
    classification: 'enforceable',
  };
}

export function ingestRulesReport(text, libraries) {
  const identify = createIdentities();
  return JSON.parse(text).map(({ rule, path, subject, line, data, error, via }) => {
    if (rule === CHECK_FAILED_RULE || rule === SKIPPED_RULE) {
      return toolError({ rule, path, subject, error });
    }
    const shown = via ?? subject;
    return {
      tool: RULES_TOOL,
      rule,
      path,
      identity: identify({ path, rule, subject }),
      subject: shown,
      ...described({ rule, subject: shown, data }, libraries),
      location: { line },
    };
  });
}
