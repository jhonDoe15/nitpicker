import { describeRuleFinding, RULES_TOOL } from '../rules/rule-hints.mjs';
import { createIdentities } from './identities.mjs';

const SKIPPED_RULE = 'rules-skipped';
const INVALID_FILE_RULE = 'project-file-invalid';
const SKIPPED_CHECKS = { file: 'some of the per-file checks', all: 'every check' };

function skippedMessage(subject) {
  const checks = SKIPPED_CHECKS[subject] ?? `the ${subject} checks`;
  return `python-rules skipped ${checks} here: an expression nests too deeply for Python's recursion limit. Split the expression to have it checked.`;
}

function invalidFileMessage(subject, { problem }) {
  return `${subject} could not be read (${problem}), so python-rules took the package as unpublished with no entry points from it, and unused-option may name a parameter an entry point passes. Fix the file.`;
}

function described({ rule, subject, data }, libraries) {
  if (rule === SKIPPED_RULE) {
    return { message: skippedMessage(subject), classification: 'descriptive' };
  }
  if (rule === INVALID_FILE_RULE) {
    return { message: invalidFileMessage(subject, data), classification: 'tool-error' };
  }
  return {
    message: describeRuleFinding(rule, subject, { libraries, data }),
    classification: 'enforceable',
  };
}

export function ingestRulesReport(text, libraries) {
  const identify = createIdentities();
  return JSON.parse(text).map(({ rule, path, subject, line, data }) => ({
    tool: RULES_TOOL,
    rule,
    path,
    identity: identify({ path, rule, subject }),
    subject,
    ...described({ rule, subject, data }, libraries),
    location: { line },
  }));
}
