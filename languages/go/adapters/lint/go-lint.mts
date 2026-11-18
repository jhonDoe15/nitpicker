import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ANY_STATUS, failure, run } from '../execution/go-process.mts';
import { lintCommand } from '../execution/go-tools.mts';
import { diagnosticFindings, parsePosition } from '../build/diagnostics.mts';
import { withoutGatedForeignKeys } from './foreign-keys/key-gate.mts';
import { lintMessage, lintRule } from './lint-rules.mts';
import { MESSAGES, messageFields } from '../../../../shared/policy.mjs';
import { exceptionText } from '../../../../shared/rules/exceptions.mjs';
import {
  UNUSED_API_RULE_IDS,
  UNUSED_OPTION_SCOPES,
} from '../../../../shared/unused-api/unused-api-policy.mjs';
import { fieldOf, listOf, parseJson, textOf } from '../../../../shared/values/readers.mts';
import type { Diagnostic, FindingRow, GoContext, SourcePosition } from '../go-types.mts';

const LINT_REPORT = 'lint.json';
const PROJECT_CONFIG_FLAG = '-project-staticcheck-config';
const PACKAGE_RULES = new Set(['ST1000', 'package-naming', 'generic-package-name']);

function isLintEntry(value: unknown): value is Diagnostic {
  return typeof fieldOf(value, 'rule') === 'string';
}

function lintArguments(context: GoContext) {
  const tags = context.settings.buildTags ?? [];
  const project = context.toolPrecedence?.['staticcheck']?.includes('project') ?? false;
  return [
    ...(tags.length === 0 ? [] : [`-tags=${tags.join(',')}`]),
    ...(project ? [PROJECT_CONFIG_FLAG] : []),
    './...',
  ];
}

export function lint(context: GoContext): void {
  const command = [lintCommand(context), ...lintArguments(context)];
  const result = run(context, command, { rule: 'go-lint-failed', accepted: ANY_STATUS });
  if (result.status !== 0 || !(result.stdout ?? '').trimStart().startsWith('{')) {
    throw failure({ command, result, rule: 'go-lint-failed' });
  }
  writeFileSync(path.join(context.reportRoot, LINT_REPORT), result.stdout ?? '');
}

const UNUSED_OPTION_TOOL = 'structure';

function unusedOption(where: SourcePosition, entry: Diagnostic): Diagnostic {
  const parsed = parseJson(entry.message);
  const name = textOf(fieldOf(parsed, 'name'));
  const published = fieldOf(parsed, 'published');
  const rule = UNUSED_API_RULE_IDS.unusedOption;
  const fields: unknown = messageFields(MESSAGES.unusedOption, {
    name,
    scope: UNUSED_OPTION_SCOPES.go[published ? 'published' : 'private'],
    exception: exceptionText(rule, where.file),
  });
  return { tool: UNUSED_OPTION_TOOL, rule, ...where, message: textOf(fieldOf(fields, 'message')) };
}

function diagnostic(projectRoot: string, entry: Diagnostic): Diagnostic[] {
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
  if (entry.tool === 'go-rules' && entry.rule === UNUSED_API_RULE_IDS.unusedOption) {
    return [unusedOption(where, entry)];
  }
  return [{ tool: entry.tool, rule: lintRule(entry.rule), ...where, message: lintMessage(entry) }];
}

export function lintFindings(context: GoContext): FindingRow[] {
  const report = parseJson(readFileSync(path.join(context.reportRoot, LINT_REPORT), 'utf8'));
  return diagnosticFindings(
    context.projectRoot,
    withoutGatedForeignKeys(
      context.projectRoot,
      listOf(fieldOf(report, 'findings'))
        .filter(isLintEntry)
        .flatMap((entry) => diagnostic(context.projectRoot, entry)),
    ),
  );
}
