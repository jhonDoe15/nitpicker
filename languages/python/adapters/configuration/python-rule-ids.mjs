import { readFileSync } from 'node:fs';
import { PYTHON_RULES_IDS } from '../../rules/rule-hints.mjs';
import { RUFF_CONFIG } from './python-ruff-config.mjs';

export const RUFF_SELECTOR = /^[A-Z]+\d*$/;
const PYRIGHT_RULE = /^report[A-Z]\w*$/;
const MYPY_CODE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const NEAR_MISS_DISTANCE = 2;
const REPLACED_RULES = { S110: 'swallowed-exception', S112: 'swallowed-exception' };
const RUFF_CODE = /"([A-Z]+\d*)"/g;
const RUFF_CONFIG_TEXT = readFileSync(RUFF_CONFIG, 'utf8');
const select = codesOf('select');
const ignore = codesOf('ignore');

function codesOf(key) {
  const list = new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)\\]`, 'm').exec(RUFF_CONFIG_TEXT);
  return list === null ? [] : [...list[1].matchAll(RUFF_CODE)].map((match) => match[1]);
}

function distance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (const [row, leftCharacter] of [...left].entries()) {
    const current = [row + 1];
    for (const [column, rightCharacter] of [...right].entries()) {
      current.push(
        Math.min(
          previous[column + 1] + 1,
          current[column] + 1,
          previous[column] + (leftCharacter === rightCharacter ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function isRuffRule(rule) {
  return (
    RUFF_SELECTOR.test(rule) &&
    !ignore.includes(rule) &&
    select.some((code) => code.startsWith(rule) || rule.startsWith(code))
  );
}

export function ruleIdProblem(rule, { projectRuff = false } = {}) {
  const ruffRule = projectRuff ? RUFF_SELECTOR.test(rule) : isRuffRule(rule);
  if (PYTHON_RULES_IDS.includes(rule) || PYRIGHT_RULE.test(rule) || ruffRule) {
    return undefined;
  }
  if (Object.hasOwn(REPLACED_RULES, rule)) {
    return `ruff ${rule} was replaced by "${REPLACED_RULES[rule]}": rename the entry to "${REPLACED_RULES[rule]}"`;
  }
  const misspelled = PYTHON_RULES_IDS.find((id) => distance(id, rule) <= NEAR_MISS_DISTANCE);
  if (misspelled !== undefined) {
    return `did you mean "${misspelled}"?`;
  }
  return MYPY_CODE.test(rule)
    ? undefined
    : 'use the id printed in the finding: a ruff code or prefix the preset selects, a python-rules id, a mypy error code or a pyright or basedpyright report rule';
}
