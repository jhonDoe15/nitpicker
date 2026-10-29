import { readFileSync } from 'node:fs';
import { ruleEntry } from '../../../shared/reference/entry.mjs';
import { hintFor } from '../rules/rule-hints.mjs';
import { allowedOf } from './hint-text.mjs';
import { isPresetRule } from './ruff-selection.mjs';

export const RUFF_RULES_FILE = new URL('../ruff/ruff-rules.json', import.meta.url);

const DOCUMENTATION = 'https://docs.astral.sh/ruff/rules';
const PLACEHOLDER = /\{(\w+)\}/gu;

function ruffEntry({ code, name, linter, summary, whatItDoes, why, useInstead }) {
  const hint = hintFor({ tool: 'ruff', rule: code });
  const selected = `Selected in the ruff config of the Python preset, with the ${linter} rules (\`${name}\`).`;
  return ruleEntry({
    tool: 'ruff',
    rule: code,
    page: 'python-ruff',
    analyzers: { python: ['python'] },
    summary: whatItDoes ?? summary.replaceAll(PLACEHOLDER, '<$1>'),
    why: why === undefined ? selected : `${why} ${selected}`,
    ...(hint === undefined ? {} : { allowed: allowedOf(hint) }),
    ...(useInstead === undefined ? {} : { example: { code: useInstead, language: 'python' } }),
    links: [{ label: 'Ruff rule documentation', url: `${DOCUMENTATION}/${name}/` }],
    exception: { key: 'python.exceptions', rule: code },
  });
}

/** The committed ruff snapshot: the version of ruff it was taken from and the rules the preset selects. */
export function readRuffSnapshot() {
  return JSON.parse(readFileSync(RUFF_RULES_FILE, 'utf8'));
}

/** The entries of the ruff rules the Python preset selects, from the committed snapshot. */
export function ruffEntries() {
  return readRuffSnapshot()
    .rules.filter(({ code }) => isPresetRule(code))
    .map(ruffEntry);
}
