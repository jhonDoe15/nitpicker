import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createIdentityCounter, hashIdentity } from '../ingest/common.mjs';
import { exceptionRoute } from './advice/exception-route.mjs';
import { rootsScope } from '../builds/module-path.mjs';

const LINT_TOOL = 'javac';
const LINT_REPORT = 'javac-lint.txt';
const LINT_FAILURE = 'javac-lint-failed.txt';
const LINT_NOT_RUN = 'lint-not-run';
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
    message: `${text}. ${advice} ${exceptionRoute(LINT_TOOL, rule)}`,
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

function lintNotRun(reportRoot, sourceRoots, moduleDir) {
  const failure = path.join(reportRoot, LINT_FAILURE);
  if (!existsSync(failure)) {
    return [];
  }
  const firstError =
    readFileSync(failure, 'utf8')
      .split(/\r?\n/)
      .find((line) => /error:/.test(line)) ?? 'javac exited with an error';
  return [
    {
      tool: LINT_TOOL,
      rule: LINT_NOT_RUN,
      path: '.',
      identity: LINT_NOT_RUN,
      message:
        `No javac lint report: the lint compile failed (${firstError.trim()}), so raw types, ` +
        'unchecked operations, deprecated calls and redundant casts were not checked. ' +
        'Fix what that compile reports (the main sources, the compile class path and Lombok), ' +
        `or add an exception for ${LINT_TOOL}/${LINT_NOT_RUN} with the path "**" in nitpicker.config.json ` +
        'if the project cannot be linted that way.',
      classification: 'descriptive',
      toolNotRun: true,
      notRunScope: rootsScope(sourceRoots, moduleDir),
    },
  ];
}

function projectFileCheck(projectRoot) {
  const known = new Map();
  return (file) => {
    if (!known.has(file)) {
      known.set(file, existsSync(path.join(projectRoot, file)));
    }
    return known.get(file);
  };
}

export function readLintFindings(reportRoot, { projectRoot, sourceRoots = [], moduleDir }) {
  const report = path.join(reportRoot, LINT_REPORT);
  if (!existsSync(report)) {
    return lintNotRun(reportRoot, sourceRoots, moduleDir);
  }
  const unique = createIdentityCounter();
  const inProject = projectFileCheck(projectRoot);
  return parseLintWarnings(readFileSync(report, 'utf8'))
    .filter(({ file }) => inProject(file))
    .map((warning) => warningFinding(warning, unique));
}
