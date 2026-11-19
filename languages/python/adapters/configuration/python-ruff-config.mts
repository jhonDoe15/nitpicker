import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldOf, listOf, parseJson, textOf } from '../../../../shared/values/readers.mts';
import type { ToolContext } from '../typed/context/tool-context-types.mts';
import { execute } from '../execution/python-process.mts';

export const RUFF_CONFIG = path.resolve(
  fileURLToPath(new URL('../', import.meta.url)),
  '../ruff/nitpicker-ruff.toml',
);
const FILTERED_CONFIG = 'nitpicker-ruff.toml';
const PREVIEW_SELECTIONS = 'nitpicker-ruff-preview.json';
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

export type PreviewRule = { readonly code: string; readonly name: string };
type InstalledRules = {
  readonly stable: Set<string>;
  readonly preview: ReadonlyMap<string, string>;
};

function isPreviewRule(rule: unknown): boolean {
  return !isStableRule(rule) && fieldOf(fieldOf(rule, 'status'), 'Removed') === undefined;
}

function codesOf(rules: readonly unknown[], keep: (rule: unknown) => boolean): Set<string> {
  return new Set(rules.filter(keep).map((rule) => textOf(fieldOf(rule, 'code'))));
}

function installedRules(context: ToolContext): InstalledRules | undefined {
  const result = execute(context, ['ruff', 'rule', '--all', '--output-format', 'json']);
  const parsed: RulesParse =
    result.error === undefined && result.status === 0
      ? parseRules(result.stdout)
      : { kind: 'unavailable' };
  if (parsed.kind !== 'rules' || !Array.isArray(parsed.rules)) {
    return undefined;
  }
  const rules = listOf(parsed.rules);
  const preview = rules.filter(isPreviewRule);
  return {
    stable: codesOf(rules, isStableRule),
    preview: new Map(
      preview.map((rule) => [textOf(fieldOf(rule, 'code')), textOf(fieldOf(rule, 'name'))]),
    ),
  };
}

function isKnown(known: ReadonlySet<string>, code: string): boolean {
  return known.has(code) || [...known].some((rule) => rule.startsWith(code));
}

function previewSelections(selected: readonly string[], known: InstalledRules): PreviewRule[] {
  return selected.flatMap((code) => {
    const name = known.preview.get(code);
    return name === undefined || isKnown(known.stable, code) ? [] : [{ code, name }];
  });
}

function filteredConfig(context: ToolContext): string {
  const text = readFileSync(RUFF_CONFIG, 'utf8');
  const known = installedRules(context);
  const selected = [...text.matchAll(SELECTED_RULE)].map(([, code]) => code ?? '');
  writeFileSync(
    path.join(context.reportRoot, PREVIEW_SELECTIONS),
    JSON.stringify(known === undefined ? [] : previewSelections(selected, known)),
  );
  if (known === undefined || selected.every((code) => isKnown(known.stable, code))) {
    return RUFF_CONFIG;
  }
  const file = path.join(context.reportRoot, FILTERED_CONFIG);
  writeFileSync(
    file,
    text.replaceAll(SELECTED_RULE, (line: string, code: string) =>
      isKnown(known.stable, code) ? line : '',
    ),
  );
  return file;
}

export function ruffConfigFor(context: ToolContext): string {
  const alreadyFiltered = path.join(context.reportRoot, FILTERED_CONFIG);
  if (!existsSync(path.join(context.reportRoot, PREVIEW_SELECTIONS))) {
    return filteredConfig(context);
  }
  return existsSync(alreadyFiltered) ? alreadyFiltered : RUFF_CONFIG;
}

export function ruffPreviewSelections(context: ToolContext): PreviewRule[] {
  ruffConfigFor(context);
  const listed = parseJson(readFileSync(path.join(context.reportRoot, PREVIEW_SELECTIONS), 'utf8'));
  return listOf(listed).map((rule) => ({
    code: textOf(fieldOf(rule, 'code')),
    name: textOf(fieldOf(rule, 'name')),
  }));
}
