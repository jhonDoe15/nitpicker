import { readFileSync } from 'node:fs';
import { escapeRegExp } from '../../../../shared/paths/glob.mjs';
import { PYTHON_RULES_IDS } from '../../rules/rule-hints.mts';
import { RUFF_CONFIG } from './python-ruff-config.mts';

export const RUFF_SELECTOR = /^[A-Z]+\d*$/;
const PYRIGHT_RULE = /^report[A-Z]\w*$/;
const MYPY_CODE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const NEAR_MISS_DISTANCE = 2;
const REPLACED_RULES: Readonly<Record<string, string>> = {
  S110: 'swallowed-exception',
  S112: 'swallowed-exception',
  FBT001: 'boolean-flag-parameter',
  FBT002: 'boolean-flag-parameter',
};
const RULE_LETTERS = /^[A-Z]+/;
const SHARED_REPLACEMENTS: Readonly<Record<string, string>> = {
  'restating-docstring': 'doc-comment-content',
  'long-docstring': 'doc-comment-content',
};
const RUFF_CODE = /"([A-Z]+\d*)"/g;
const RUFF_CONFIG_TEXT = readFileSync(RUFF_CONFIG, 'utf8');
export const RUFF_SELECT = codesOf('select');
export const RUFF_IGNORE = codesOf('ignore');
export const RUFF_PROMOTED_FIXES = codesOf('extend-safe-fixes');

function codesOf(key: string): string[] {
  const list = new RegExp(`^${String(escapeRegExp(key))}\\s*=\\s*\\[([^\\]]*)\\]`, 'm').exec(
    RUFF_CONFIG_TEXT,
  );
  return list === null
    ? []
    : [...(list[1] ?? '').matchAll(RUFF_CODE)].map((match) => match[1] ?? '');
}

function distance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (const [row, leftCharacter] of left.split('').entries()) {
    const current = [row + 1];
    for (const [column, rightCharacter] of right.split('').entries()) {
      current.push(
        Math.min(
          (previous[column + 1] ?? 0) + 1,
          (current[column] ?? 0) + 1,
          (previous[column] ?? 0) + (leftCharacter === rightCharacter ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}

function selects(code: string, rule: string): boolean {
  return (
    code.startsWith(rule) ||
    (rule.startsWith(code) && RULE_LETTERS.exec(code)?.[0] === RULE_LETTERS.exec(rule)?.[0])
  );
}

function isRuffRule(rule: string): boolean {
  return (
    RUFF_SELECTOR.test(rule) &&
    !RUFF_IGNORE.includes(rule) &&
    RUFF_SELECT.some((code) => selects(code, rule))
  );
}

export function ruleIdProblem(
  rule: string,
  { projectRuff }: { projectRuff: boolean } = { projectRuff: false },
): string | undefined {
  const ruffRule = projectRuff ? RUFF_SELECTOR.test(rule) : isRuffRule(rule);
  if (PYTHON_RULES_IDS.includes(rule) || PYRIGHT_RULE.test(rule) || ruffRule) {
    return undefined;
  }
  if (Object.hasOwn(SHARED_REPLACEMENTS, rule)) {
    return `${rule} is now the shared "${String(SHARED_REPLACEMENTS[rule])}" rule: move the entry to the top-level "exceptions" as "${String(SHARED_REPLACEMENTS[rule])}"`;
  }
  if (Object.hasOwn(REPLACED_RULES, rule)) {
    return `ruff ${rule} was replaced by "${String(REPLACED_RULES[rule])}": rename the entry to "${String(REPLACED_RULES[rule])}"`;
  }
  const misspelled = PYTHON_RULES_IDS.find((id) => distance(id, rule) <= NEAR_MISS_DISTANCE);
  if (misspelled !== undefined) {
    return `did you mean "${misspelled}"?`;
  }
  return MYPY_CODE.test(rule)
    ? undefined
    : 'use the id printed in the finding: a ruff code or prefix the preset selects, a python-rules id, a mypy error code or a pyright or basedpyright report rule';
}
