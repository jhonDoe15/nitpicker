import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ANY_STATUS, failure, run } from '../execution/go-process.mjs';
import { lintCommand } from '../execution/go-tools.mjs';
import { diagnosticFindings, parsePosition } from '../build/diagnostics.mjs';
import { lintMessage, lintRule } from './lint-rules.mjs';

const LINT_REPORT = 'lint.json';
const PROJECT_CONFIG_FLAG = '-project-staticcheck-config';
const PACKAGE_RULES = new Set(['ST1000', 'package-naming']);

function lintArguments(context) {
  const tags = context.settings.buildTags ?? [];
  const project = context.toolPrecedence?.staticcheck?.includes('project') ?? false;
  return [
    ...(tags.length === 0 ? [] : [`-tags=${tags.join(',')}`]),
    ...(project ? [PROJECT_CONFIG_FLAG] : []),
    './...',
  ];
}

export function lint(context) {
  const command = [lintCommand(context), ...lintArguments(context)];
  const result = run(context, command, { rule: 'go-lint-failed', accepted: ANY_STATUS });
  if (result.status !== 0 || !(result.stdout ?? '').trimStart().startsWith('{')) {
    throw failure({ command, result, rule: 'go-lint-failed' });
  }
  writeFileSync(path.join(context.reportRoot, LINT_REPORT), result.stdout);
}

function diagnostic(projectRoot, entry) {
  const position = parsePosition(
    projectRoot,
    `${entry.file}:${String(entry.line)}:${String(entry.column)}`,
  );
  if (position === undefined) {
    return [];
  }
  const where = PACKAGE_RULES.has(entry.rule)
    ? { file: path.posix.dirname(position.file), line: 1 }
    : position;
  return [{ tool: entry.tool, rule: lintRule(entry.rule), ...where, message: lintMessage(entry) }];
}

export function lintFindings(context) {
  const report = JSON.parse(readFileSync(path.join(context.reportRoot, LINT_REPORT), 'utf8'));
  return diagnosticFindings(
    context.projectRoot,
    report.findings.flatMap((entry) => diagnostic(context.projectRoot, entry)),
  );
}
