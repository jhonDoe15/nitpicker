import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createIdentityCounter, hashIdentity } from '../ingest/common.mjs';

const LINT_TOOL = 'javac';
const LINT_REPORT = 'javac-lint.txt';
const WARNING = /^(.+\.java):(\d+): warning: \[(\w+)\] (.+)$/;
const ADVICE = {
  rawtypes: 'Add the type arguments, as in List<String>.',
  unchecked:
    'Use a typed API, a checked conversion or a generic method instead of the unchecked operation.',
  deprecation: "Call the replacement named in the API's Javadoc.",
  removal: "Call the replacement named in the API's Javadoc; this API is going to be removed.",
  cast: 'Remove the cast.',
};

function warningFinding({ file, line, rule, text }, unique) {
  const advice = ADVICE[rule] ?? 'Fix the warning.';
  return {
    tool: LINT_TOOL,
    rule,
    path: file,
    identity: unique(hashIdentity('javac', [rule, file, text])),
    message: `${text}. ${advice} If it is right here, add an exception for ${LINT_TOOL}/${rule} in nitpicker.config.json.`,
    classification: 'enforceable',
    location: { line },
  };
}

export function parseLintWarnings(text) {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = WARNING.exec(line);
    return match === null
      ? []
      : [{ file: match[1], line: Number(match[2]), rule: match[3], text: match[4] }];
  });
}

export function readLintFindings(reportRoot, { projectRoot }) {
  const report = path.join(reportRoot, LINT_REPORT);
  if (!existsSync(report)) {
    return [];
  }
  const unique = createIdentityCounter();
  return parseLintWarnings(readFileSync(report, 'utf8'))
    .filter(({ file }) => existsSync(path.join(projectRoot, file)))
    .map((warning) => warningFinding(warning, unique));
}
