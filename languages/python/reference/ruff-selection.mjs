import { spawnSync } from 'node:child_process';
import { isStableRule } from '../adapters/configuration/python-ruff-config.mjs';
import { RUFF_IGNORE, RUFF_SELECT } from '../adapters/configuration/python-rule-ids.mjs';

const CODE = /^([A-Z]+)(\d*)$/u;
const MAXIMUM_OUTPUT = 64 * 1024 * 1024;

function isSelected(code) {
  const [, letters, digits] = CODE.exec(code);
  return RUFF_SELECT.some((selector) => {
    const [, selectorLetters, selectorDigits] = CODE.exec(selector);
    return selectorLetters === letters && digits.startsWith(selectorDigits);
  });
}

/** The stable ruff rules the preset's ruff config selects, as `{ code, name, linter, summary }` sorted by code. */
export function selectedRuffRules(rules) {
  return rules
    .filter(
      (rule) => isStableRule(rule) && isSelected(rule.code) && !RUFF_IGNORE.includes(rule.code),
    )
    .map(({ code, name, linter, summary }) => ({ code, name, linter, summary }))
    .toSorted((left, right) => left.code.localeCompare(right.code));
}

/** The selected rules of the installed ruff, or undefined when it cannot be run. */
export function installedRuffRules(ruff = process.env.NITPICKER_RUFF ?? 'ruff') {
  const result = spawnSync(ruff, ['rule', '--all', '--output-format', 'json'], {
    encoding: 'utf8',
    maxBuffer: MAXIMUM_OUTPUT,
  });
  return result.status === 0 ? selectedRuffRules(JSON.parse(result.stdout)) : undefined;
}
