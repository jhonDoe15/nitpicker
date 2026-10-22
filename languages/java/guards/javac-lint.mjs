import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createLineIdentity, projectFile } from '../../../shared/ingest/common.mjs';
import { exceptionHint } from '../../../shared/rules/exceptions.mjs';
import { rootsScope } from '../builds/module-path.mjs';

const LINT_TOOL = 'javac';
const LINT_NOT_RUN = 'lint-not-run';
const MAIN_SET = { identity: LINT_NOT_RUN, sources: 'the main sources, the compile class path' };
const TEST_SET = {
  identity: `test-${LINT_NOT_RUN}`,
  sources: 'the test sources, the test compile class path',
};
const WARNING = /^(.+\.java):(\d+): warning: \[(\w+)\] (.+)$/;
const ADVICE = {
  rawtypes: 'Add the type arguments, as in List<String>.',
  unchecked:
    'Use a typed API, a checked conversion or a generic method instead of the unchecked operation.',
  deprecation: "Call the replacement named in the API's Javadoc.",
  removal: "Call the replacement named in the API's Javadoc; this API is going to be removed.",
  cast: 'Remove the cast.',
};

function warningFinding({ file, line, rule, text }, identity) {
  const advice = ADVICE[rule] ?? 'Fix the warning.';
  return {
    tool: LINT_TOOL,
    rule,
    path: file,
    identity: identity({ file, line, parts: [rule, text] }),
    message: `${text}. ${advice}`,
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

function lintNotRun({ set, failure, roots, module }) {
  if (!existsSync(failure)) {
    return [];
  }
  const firstError =
    readFileSync(failure, 'utf8')
      .split(/\r?\n/)
      .find((line) => /error:/.test(line)) ?? 'javac exited with an error';
  const scope = rootsScope(roots, module);
  return [
    {
      tool: LINT_TOOL,
      rule: LINT_NOT_RUN,
      path: '.',
      identity: set.identity,
      message:
        `No javac lint report from the lint compile (${firstError.trim()}), so raw types, ` +
        'unchecked operations, deprecated calls and redundant casts were not checked. ' +
        `Fix what that compile reports (${set.sources} and Lombok). ` +
        exceptionHint(`${LINT_TOOL}/${LINT_NOT_RUN}`, '**'),
      classification: 'descriptive',
      ...(scope.length === 0 ? {} : { toolNotRun: true, notRunScope: scope }),
    },
  ];
}

function projectFileCheck(projectRoot) {
  const known = new Map();
  return (file) => {
    if (!known.has(file)) {
      const absolute = projectFile(projectRoot, file);
      known.set(file, absolute !== undefined && existsSync(absolute));
    }
    return known.get(file);
  };
}

function sourceSetFindings({ set, report, failure, roots, module, read }) {
  if (!existsSync(report)) {
    return lintNotRun({ set, failure, roots, module });
  }
  return read(report);
}

export function readLintFindings(reportRoot, options) {
  const { projectRoot, sourceRoots = [], testRoots = [], module } = options;
  const identity = createLineIdentity('javac', projectRoot);
  const inProject = projectFileCheck(projectRoot);
  function read(report) {
    return parseLintWarnings(readFileSync(report, 'utf8'))
      .filter(({ file }) => inProject(file))
      .map((warning) => warningFinding(warning, identity));
  }
  return [
    ...sourceSetFindings({
      set: MAIN_SET,
      report: path.join(reportRoot, 'javac-lint.txt'),
      failure: path.join(reportRoot, 'javac-lint-failed.txt'),
      roots: sourceRoots,
      module,
      read,
    }),
    ...sourceSetFindings({
      set: TEST_SET,
      report: path.join(reportRoot, 'javac-lint-test.txt'),
      failure: path.join(reportRoot, 'javac-lint-test-failed.txt'),
      roots: testRoots,
      module,
      read,
    }),
  ];
}
