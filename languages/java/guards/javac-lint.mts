import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createLineIdentity, projectFile } from '../../../shared/ingest/common.mjs';
import { exceptionHint } from '../../../shared/rules/exceptions.mjs';
import { rootsScope } from '../builds/module-path.mts';

type Identity = (parts: {
  readonly file: string;
  readonly line: number | undefined;
  readonly parts: readonly string[];
}) => string;
type LintWarning = {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly text: string;
};
type LintFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
  readonly location?: { readonly line: number };
  readonly toolNotRun?: true;
  readonly notRunScope?: readonly string[];
};
type SourceSet = { readonly identity: string; readonly sources: string; readonly checked: string };
type SetReport = {
  readonly set: SourceSet;
  readonly failure: string;
  readonly roots: readonly string[];
  readonly module?: { moduleDir?: string; modulePath?: string } | undefined;
};
type LintOptions = {
  readonly projectRoot: string;
  readonly sourceRoots?: readonly string[];
  readonly testRoots?: readonly string[];
  readonly module?: { moduleDir?: string; modulePath?: string } | undefined;
};

const lineIdentity: (prefix: string, projectRoot: string) => Identity = createLineIdentity;
const projectFileOf: (root: string, file: string) => string | undefined = projectFile;
const hintFor: (rule: string, path: string) => string = exceptionHint;

const LINT_TOOL = 'javac';
const LINT_NOT_RUN = 'lint-not-run';
const MAIN_SET: SourceSet = {
  identity: LINT_NOT_RUN,
  sources: 'the main sources, the compile class path',
  checked: 'raw types, unchecked operations, deprecated calls and redundant casts',
};
const TEST_SET: SourceSet = {
  identity: `test-${LINT_NOT_RUN}`,
  sources: 'the test sources, the test compile class path',
  checked: 'raw types, unchecked operations, removed calls and redundant casts',
};
const WARNING = /^(.+\.java):(\d+): warning: \[(\w+)\] (.+)$/;
export const LINT_ADVICE: Record<string, string> = {
  rawtypes: 'Add the type arguments, as in List<String>.',
  unchecked:
    'Use a typed API, a checked conversion or a generic method instead of the unchecked operation.',
  deprecation: "Call the replacement named in the API's Javadoc.",
  removal: "Call the replacement named in the API's Javadoc; this API is going to be removed.",
  cast: 'Remove the cast.',
};

function warningFinding({ file, line, rule, text }: LintWarning, identity: Identity): LintFinding {
  const advice = LINT_ADVICE[rule] ?? 'Fix the warning.';
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

export function parseLintWarnings(text: string): LintWarning[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = WARNING.exec(line);
    return match === null
      ? []
      : [
          {
            file: match[1] ?? '',
            line: Number(match[2]),
            rule: match[3] ?? '',
            text: match[4] ?? '',
          },
        ];
  });
}

function lintNotRun({ set, failure, roots, module }: SetReport): LintFinding[] {
  if (!existsSync(failure)) {
    return [];
  }
  const firstError =
    readFileSync(failure, 'utf8')
      .split(/\r?\n/)
      .find((line) => line.includes('error:')) ?? 'javac exited with an error';
  const scope = rootsScope(roots, module);
  return [
    {
      tool: LINT_TOOL,
      rule: LINT_NOT_RUN,
      path: '.',
      identity: set.identity,
      message:
        `No javac lint report from the lint compile (${firstError.trim()}), so ${set.checked} ` +
        'were not checked. ' +
        `Fix what that compile reports (${set.sources} and Lombok). ` +
        hintFor(`${LINT_TOOL}/${LINT_NOT_RUN}`, '**'),
      classification: 'descriptive',
      ...(scope.length === 0 ? {} : { toolNotRun: true, notRunScope: scope }),
    },
  ];
}

function projectFileCheck(projectRoot: string): (file: string) => boolean {
  const known = new Map<string, boolean>();
  return (file) => {
    if (!known.has(file)) {
      const absolute = projectFileOf(projectRoot, file);
      known.set(file, absolute !== undefined && existsSync(absolute));
    }
    return known.get(file) === true;
  };
}

function sourceSetFindings({
  set,
  report,
  failure,
  roots,
  module,
  read,
}: SetReport & { report: string; read: (report: string) => LintFinding[] }): LintFinding[] {
  if (!existsSync(report)) {
    return lintNotRun({ set, failure, roots, module });
  }
  return read(report);
}

export function readLintFindings(reportRoot: string, options: LintOptions): LintFinding[] {
  const { projectRoot, sourceRoots = [], testRoots = [], module } = options;
  const identity = lineIdentity('javac', projectRoot);
  const inProject = projectFileCheck(projectRoot);
  function read(report: string): LintFinding[] {
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
