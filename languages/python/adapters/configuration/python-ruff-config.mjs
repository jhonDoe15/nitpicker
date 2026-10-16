import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute } from '../execution/python-process.mjs';

export const RUFF_CONFIG = path.resolve(
  fileURLToPath(new URL('../', import.meta.url)),
  '../ruff/nitpicker-ruff.toml',
);
const FILTERED_CONFIG = 'nitpicker-ruff.toml';
const SELECTED_RULE = /^\s*"(RUF\d+)",\n/gm;
const configs = new WeakMap();

function installedRules(context) {
  const result = execute(context, ['ruff', 'rule', '--all', '--output-format', 'json']);
  if (result.error !== undefined || result.status !== 0) {
    return undefined;
  }
  try {
    const rules = JSON.parse(result.stdout);
    return new Set(
      rules.filter((rule) => rule.status?.Removed === undefined).map((rule) => rule.code),
    );
  } catch {
    return undefined;
  }
}

function filteredConfig(context) {
  const text = readFileSync(RUFF_CONFIG, 'utf8');
  const known = installedRules(context);
  if (
    known === undefined ||
    [...text.matchAll(SELECTED_RULE)].every(([, code]) => known.has(code))
  ) {
    return RUFF_CONFIG;
  }
  const file = path.join(context.reportRoot, FILTERED_CONFIG);
  writeFileSync(
    file,
    text.replaceAll(SELECTED_RULE, (line, code) => (known.has(code) ? line : '')),
  );
  return file;
}

export function ruffConfigFor(context) {
  if (!configs.has(context)) {
    configs.set(context, filteredConfig(context));
  }
  return configs.get(context);
}
