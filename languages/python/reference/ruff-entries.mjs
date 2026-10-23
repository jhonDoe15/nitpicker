import { readFileSync } from 'node:fs';
import { ruleEntry } from '../../../shared/reference/entry.mjs';
import { hintFor } from '../rules/rule-hints.mjs';
import { allowedOf } from './hint-text.mjs';

export const RUFF_RULES_FILE = new URL('../ruff/ruff-rules.json', import.meta.url);

const DOCUMENTATION = 'https://docs.astral.sh/ruff/rules';

function ruffEntry({ code, name, linter, summary }) {
  const hint = hintFor({ tool: 'ruff', rule: code });
  return ruleEntry({
    tool: 'ruff',
    rule: code,
    page: 'python-ruff',
    analyzers: { python: ['python'] },
    summary,
    why: `Selected in the ruff config of the Python preset, with the ${linter} rules (\`${name}\`).`,
    ...(hint === undefined ? {} : { allowed: allowedOf(hint) }),
    links: [{ label: 'Ruff rule documentation', url: `${DOCUMENTATION}/${name}/` }],
    exception: { key: 'python.exceptions', rule: code },
  });
}

function readRuffRules() {
  return JSON.parse(readFileSync(RUFF_RULES_FILE, 'utf8'));
}

/** The entries of the ruff rules the Python preset selects, from the committed snapshot. */
export function ruffEntries() {
  return readRuffRules().map(ruffEntry);
}
