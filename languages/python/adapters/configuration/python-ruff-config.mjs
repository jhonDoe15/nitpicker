import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute } from '../execution/python-process.mjs';

export const RUFF_CONFIG = path.resolve(
  fileURLToPath(new URL('../', import.meta.url)),
  '../ruff/nitpicker-ruff.toml',
);
const FILTERED_CONFIG = 'nitpicker-ruff.toml';
const SELECTED_RULE = /^\s*"([A-Z]+\d+)",\n/gm;

function parseRules(text) {
  try {
    return { kind: 'rules', rules: JSON.parse(text) };
  } catch {
    return { kind: 'malformed-json' };
  }
}

export function isStableRule(rule) {
  return (
    rule.preview !== true &&
    rule.status?.Removed === undefined &&
    rule.status?.Preview === undefined
  );
}

function installedRules(context) {
  const result = execute(context, ['ruff', 'rule', '--all', '--output-format', 'json']);
  const parsed = result.error === undefined && result.status === 0 ? parseRules(result.stdout) : {};
  if (parsed.kind !== 'rules' || !Array.isArray(parsed.rules)) {
    return undefined;
  }
  return new Set(parsed.rules.filter(isStableRule).map((rule) => rule.code));
}

function isKnown(known, code) {
  return known.has(code) || [...known].some((rule) => rule.startsWith(code));
}

function filteredConfig(context) {
  const text = readFileSync(RUFF_CONFIG, 'utf8');
  const known = installedRules(context);
  if (
    known === undefined ||
    [...text.matchAll(SELECTED_RULE)].every(([, code]) => isKnown(known, code))
  ) {
    return RUFF_CONFIG;
  }
  const file = path.join(context.reportRoot, FILTERED_CONFIG);
  writeFileSync(
    file,
    text.replaceAll(SELECTED_RULE, (line, code) => (isKnown(known, code) ? line : '')),
  );
  return file;
}

export function ruffConfigFor(context) {
  const alreadyFiltered = path.join(context.reportRoot, FILTERED_CONFIG);
  return existsSync(alreadyFiltered) ? alreadyFiltered : filteredConfig(context);
}
