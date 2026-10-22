import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import { hash } from '../../../../../shared/rules/finding-helpers.mjs';
import { createIdentityCounter } from '../../../../../shared/ingest/common.mjs';
import { compilerWarningRule } from './kotlin-rules.mjs';

const TOOL = 'kotlinc';
const REPORT = 'kotlinc.json';
const LINT_NOT_RUN = 'lint-not-run';
const WARNING = /^(.+\.kt):(\d+):\d+: warning: \[([A-Z_]+)\] (.+)$/;
const ERROR = /^(?:.+\.kt:\d+:\d+: )?error: (.+)$/;
const ADVICE = {
  unchecked:
    'Use a typed API, a checked conversion (`as? List<*>` and a check of each element) or a reified generic function instead of the unchecked cast.',
  deprecation:
    'Call the replacement the deprecation names (its `ReplaceWith`, or the Javadoc of a Java API).',
  cast: 'Remove the cast.',
};

export function parseCompilerWarnings(text) {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = WARNING.exec(line);
    const rule = match === null ? undefined : compilerWarningRule(match[3]);
    return rule === undefined
      ? []
      : [
          {
            file: match[1],
            line: Number(match[2]),
            rule: rule.slice(TOOL.length + 1),
            text: match[4],
          },
        ];
  });
}

function lintNotRun(output) {
  const firstError = output
    .split(/\r?\n/)
    .map((line) => ERROR.exec(line)?.[0])
    .find(Boolean);
  return {
    tool: TOOL,
    rule: LINT_NOT_RUN,
    path: '.',
    identity: LINT_NOT_RUN,
    message:
      `No kotlinc lint report from the lint compile (${firstError ?? 'kotlinc exited with an error'}), so unchecked casts, ` +
      'deprecated calls and redundant casts were not checked. Fix what that compile reports (the main sources, ' +
      `the compile class path and the compiler plugins). ${exceptionHint(`${TOOL}/${LINT_NOT_RUN}`, '**')}`,
    classification: 'descriptive',
  };
}

function warningFinding({ file, line, rule, text }, next) {
  const subject = text.replaceAll(/\b\d+\b/g, '#');
  return {
    tool: TOOL,
    rule,
    path: file,
    identity: next(`${rule}:${hash(subject)}`),
    message: `${ADVICE[rule]} The compiler warns: ${text.replace(/\.$/, '')}.`,
    classification: 'enforceable',
    location: { line },
  };
}

function inRoots(file, sourceRoots) {
  return sourceRoots.some((root) => file.startsWith(`${root}/`));
}

export function readCompilerFindings(reportRoot, sourceRoots) {
  const report = path.join(reportRoot, REPORT);
  if (!existsSync(report)) {
    return [];
  }
  const { exitCode, output } = JSON.parse(readFileSync(report, 'utf8'));
  if (exitCode !== 0) {
    return [lintNotRun(output)];
  }
  const counters = new Map();
  return parseCompilerWarnings(output)
    .filter(({ file }) => inRoots(file, sourceRoots))
    .map((warning) => {
      if (!counters.has(warning.file)) {
        counters.set(warning.file, createIdentityCounter());
      }
      return warningFinding(warning, counters.get(warning.file));
    });
}
