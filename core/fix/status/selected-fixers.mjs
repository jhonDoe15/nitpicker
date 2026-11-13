import { REVIEW, SAFE } from '../engine/safety.mjs';
import { codeFixes } from '../../../languages/typescript/fix/code-fixes/code-fix-rules.mjs';
import { OWN_SUGGESTION_RULES } from '../../../languages/typescript/fix/suggestions/own-suggestion-rules.mjs';
import { RUFF_PROMOTED_FIXES } from '../../../languages/python/adapters/configuration/python-rule-ids.mjs';
import { REVIEW_CODES } from '../../../languages/python/fix/review/review-rules.mjs';
import { suggestionRules } from '../../../languages/typescript/fix/suggestions/suggestion-rules.mjs';

const TYPESCRIPT_PRESETS = ['typescript', 'javascript'];

const DEAD_CODE_RULES = Object.freeze({
  exports: REVIEW,
  types: REVIEW,
  'unused-dependency': SAFE,
  files: REVIEW,
});

function listed(tool, entries, presets = TYPESCRIPT_PRESETS) {
  return entries.map(([rule, safety]) => ({ tool, rule, safety, presets }));
}

const OWN_SUGGESTIONS = OWN_SUGGESTION_RULES.map((name) => [`nitpicker/${name}`, REVIEW]);

export const SELECTED_FIXER_RULES = Object.freeze([
  ...listed('eslint-lint', OWN_SUGGESTIONS),
  ...listed('eslint-lint', Object.entries(suggestionRules)),
  ...listed(
    'typescript-typecheck',
    codeFixes.flatMap(({ codes, safety }) => codes.map((code) => [`TS${code}`, safety])),
  ),
  ...listed('dead-code', Object.entries(DEAD_CODE_RULES)),
  ...listed(
    'ruff',
    [
      ...RUFF_PROMOTED_FIXES.map((code) => [code, SAFE]),
      ...REVIEW_CODES.map((code) => [code, REVIEW]),
    ],
    ['python'],
  ),
]);
