import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionHint as untypedExceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import { hash as untypedHash } from '../../../../../shared/rules/finding-helpers.mjs';
import { createIdentityCounter as untypedCreateIdentityCounter } from '../../../../../shared/ingest/common.mjs';
import { fieldOf, parseJson, textOf } from '../../../../../shared/values/readers.mts';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { compilerWarningRule } from './kotlin-rules.mts';

type Warning = { file: string; line: number; rule: string; text: string };
type Kind = 'main' | 'test';

const exceptionHint: (rule: string, path: string) => string = untypedExceptionHint;
const hash: (value: string) => string = untypedHash;
const createIdentityCounter: () => (identity: string) => string = untypedCreateIdentityCounter;

const TOOL = 'kotlinc';
const REPORTS = { main: 'kotlinc.json', test: 'kotlinc-test.json' };
const LINT_NOT_RUN = 'lint-not-run';
const WARNING = /^(.+\.kt):(\d+):\d+: warning: \[([A-Z_]+)\] (.+)$/;
const ERROR = /^(?:.+\.kt:\d+:\d+: )?error: (.+)$/;
export const KOTLINC_ADVICE = {
  unchecked:
    'Use a typed API, a checked conversion (`as? List<*>` and a check of each element) or a reified generic function instead of the unchecked cast.',
  deprecation:
    'Call the replacement the deprecation names (its `ReplaceWith`, or the Javadoc of a Java API).',
  cast: 'Remove the cast.',
};

const advice: Readonly<Record<string, string>> = KOTLINC_ADVICE;

export function parseCompilerWarnings(text: string): Warning[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = WARNING.exec(line);
    const rule = match === null ? undefined : compilerWarningRule(match[3] ?? '');
    return match === null || rule === undefined
      ? []
      : [
          {
            file: match[1] ?? '',
            line: Number(match[2]),
            rule: rule.slice(TOOL.length + 1),
            text: match[4] ?? '',
          },
        ];
  });
}

export function lintNotRun(output: string, kind: string | undefined): Finding {
  const firstError = output
    .split(/\r?\n/)
    .map((line) => ERROR.exec(line)?.[0])
    .find(Boolean);
  const sources = kind === 'test' ? 'test sources' : 'main sources';
  return {
    tool: TOOL,
    rule: LINT_NOT_RUN,
    path: '.',
    identity: kind === 'test' ? `${LINT_NOT_RUN}:test` : LINT_NOT_RUN,
    message:
      `No kotlinc lint report from the lint compile of the ${sources} (${firstError ?? 'kotlinc exited with an error'}), so unchecked casts, ` +
      `deprecated calls and redundant casts were not checked there. Fix what that compile reports (the ${sources}, ` +
      `the compile class path and the compiler plugins). ${exceptionHint(`${TOOL}/${LINT_NOT_RUN}`, '**')}`,
    classification: 'descriptive',
  };
}

function warningFinding(
  { file, line, rule, text }: Warning,
  next: (identity: string) => string,
): Finding {
  const subject = text.replaceAll(/\b\d+\b/g, '#');
  return {
    tool: TOOL,
    rule,
    path: file,
    identity: next(`${rule}:${hash(subject)}`),
    message: `${advice[rule] ?? ''} The compiler warns: ${text.replace(/\.$/, '')}.`,
    classification: 'enforceable',
    location: { line },
  };
}

function inRoots(file: string, sourceRoots: readonly string[]): boolean {
  return sourceRoots.some((root) => file.startsWith(`${root}/`));
}

function readReport(reportRoot: string, kind: Kind, sourceRoots: readonly string[]): Finding[] {
  const report = path.join(reportRoot, REPORTS[kind]);
  if (!existsSync(report)) {
    return [];
  }
  const parsed = parseJson(readFileSync(report, 'utf8'));
  const output = textOf(fieldOf(parsed, 'output'));
  if (fieldOf(parsed, 'exitCode') !== 0) {
    return [lintNotRun(output, kind)];
  }
  const counters = new Map<string, (identity: string) => string>();
  return parseCompilerWarnings(output)
    .filter(({ file }) => inRoots(file, sourceRoots))
    .map((warning) => {
      const known = counters.get(warning.file);
      const next = known ?? createIdentityCounter();
      if (known === undefined) {
        counters.set(warning.file, next);
      }
      return warningFinding(warning, next);
    });
}

export function readCompilerFindings(
  reportRoot: string,
  sourceRoots: readonly string[],
  testRoots: readonly string[] = [],
): Finding[] {
  return [
    ...readReport(reportRoot, 'main', sourceRoots),
    ...readReport(reportRoot, 'test', testRoots),
  ];
}
