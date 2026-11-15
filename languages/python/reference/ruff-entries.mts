import { readFileSync } from 'node:fs';
import { allowedOf } from './hint-text.mts';
import { isPresetRule } from './ruff-selection.mts';
import { hintFor, ruleEntry } from './typed/hint-views.mts';
import { parseRuffSnapshot } from './typed/ruff-rule-views.mts';
import type { EntryView } from './typed/hint-views.mts';
import type { RuffRule, RuffSnapshot } from './typed/ruff-rule-views.mts';

export const RUFF_RULES_FILE = new URL('../ruff/ruff-rules.json', import.meta.url);

const DOCUMENTATION = 'https://docs.astral.sh/ruff/rules';
const PYTHON = 'python';
const PLACEHOLDER = /\{(\w+)\}/gu;

function ruffEntry({
  code,
  name,
  linter,
  summary,
  whatItDoes,
  why,
  useInstead,
  safeFix,
}: RuffRule): EntryView {
  const hint = hintFor({ tool: 'ruff', rule: code });
  const selected = `Selected in the ruff config of the Python preset, with the ${linter} rules (\`${name}\`).`;
  return ruleEntry({
    tool: 'ruff',
    rule: code,
    page: 'python-ruff',
    analyzers: { python: [PYTHON] },
    summary: whatItDoes ?? summary.replaceAll(PLACEHOLDER, '<$1>'),
    why: why === undefined ? selected : `${why} ${selected}`,
    ...(hint === undefined ? {} : { allowed: allowedOf(hint) }),
    ...(useInstead === undefined ? {} : { example: { code: useInstead, language: PYTHON } }),
    ...(safeFix === true ? { fixableIn: [PYTHON] } : {}),
    links: [{ label: 'Ruff rule documentation', url: `${DOCUMENTATION}/${name}/` }],
    exception: { key: 'python.exceptions', rule: code },
  });
}

export function readRuffSnapshot(): RuffSnapshot {
  return parseRuffSnapshot(readFileSync(RUFF_RULES_FILE, 'utf8'));
}

export function ruffEntries(): EntryView[] {
  return readRuffSnapshot()
    .rules.filter(({ code }) => isPresetRule(code))
    .map(ruffEntry);
}
