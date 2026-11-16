import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';
import type { ToolContext } from '../typed/context/tool-context-types.mts';
import { execute } from '../execution/python-process.mts';

export const RUFF_CONFIG = path.resolve(
  fileURLToPath(new URL('../', import.meta.url)),
  '../ruff/nitpicker-ruff.toml',
);
const FILTERED_CONFIG = 'nitpicker-ruff.toml';
type RulesParse =
  | { readonly kind: 'rules'; readonly rules: unknown }
  | { readonly kind: 'malformed-json' }
  | { readonly kind: 'unavailable' };

const SELECTED_RULE = /^\s*"([A-Z]+\d+)",\n/gm;

function parseRules(text: string): RulesParse {
  try {
    return { kind: 'rules', rules: JSON.parse(text) };
  } catch {
    return { kind: 'malformed-json' };
  }
}

export function isStableRule(rule: unknown): boolean {
  const status = fieldOf(rule, 'status');
  return (
    fieldOf(rule, 'preview') !== true &&
    fieldOf(status, 'Removed') === undefined &&
    fieldOf(status, 'Preview') === undefined
  );
}

function installedRules(context: ToolContext): Set<string> | undefined {
  const result = execute(context, ['ruff', 'rule', '--all', '--output-format', 'json']);
  const parsed: RulesParse =
    result.error === undefined && result.status === 0
      ? parseRules(result.stdout)
      : { kind: 'unavailable' };
  if (parsed.kind !== 'rules' || !Array.isArray(parsed.rules)) {
    return undefined;
  }
  return new Set(
    listOf(parsed.rules)
      .filter(isStableRule)
      .map((rule) => textOf(fieldOf(rule, 'code'))),
  );
}

function isKnown(known: ReadonlySet<string>, code: string): boolean {
  return known.has(code) || [...known].some((rule) => rule.startsWith(code));
}

function filteredConfig(context: ToolContext): string {
  const text = readFileSync(RUFF_CONFIG, 'utf8');
  const known = installedRules(context);
  if (
    known === undefined ||
    [...text.matchAll(SELECTED_RULE)].every(([, code]) => isKnown(known, code ?? ''))
  ) {
    return RUFF_CONFIG;
  }
  const file = path.join(context.reportRoot, FILTERED_CONFIG);
  writeFileSync(
    file,
    text.replaceAll(SELECTED_RULE, (line: string, code: string) =>
      isKnown(known, code) ? line : '',
    ),
  );
  return file;
}

export function ruffConfigFor(context: ToolContext): string {
  const alreadyFiltered = path.join(context.reportRoot, FILTERED_CONFIG);
  return existsSync(alreadyFiltered) ? alreadyFiltered : filteredConfig(context);
}
