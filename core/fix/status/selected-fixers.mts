import { REVIEW, SAFE } from '../engine/safety.mjs';
import { codeFixes } from '../../../languages/typescript/fix/code-fixes/code-fix-rules.mjs';
import { OWN_SUGGESTION_RULES } from '../../../languages/typescript/fix/suggestions/own-suggestion-rules.mjs';
import { RUFF_PROMOTED_FIXES } from '../../../languages/python/adapters/configuration/python-rule-ids.mts';
import { REVIEW_CODES } from '../../../languages/python/fix/review/review-rules.mts';
import { suggestionRules } from '../../../languages/typescript/fix/suggestions/suggestion-rules.mjs';

import type { PresetRule } from '../typed/fix-types.mts';

const TYPESCRIPT_PRESETS = ['typescript', 'javascript'];

const DEAD_CODE_RULES = Object.freeze({
  exports: REVIEW,
  types: REVIEW,
  'unused-dependency': SAFE,
  files: REVIEW,
});

function listed(
  tool: string,
  entries: readonly (readonly [string, string])[],
  presets: readonly string[] = TYPESCRIPT_PRESETS,
): PresetRule[] {
  return entries.map(([rule, safety]) => ({ tool, rule, safety, presets }));
}

const OWN_SUGGESTIONS: [string, string][] = OWN_SUGGESTION_RULES.map((name) => [
  `nitpicker/${name}`,
  REVIEW,
]);

export const SELECTED_FIXER_RULES = Object.freeze([
  ...listed('eslint-lint', OWN_SUGGESTIONS),
  ...listed('eslint-lint', Object.entries(suggestionRules)),
  ...listed(
    'typescript-typecheck',
    codeFixes.flatMap(({ codes, safety }) =>
      codes.map((code): [string, string] => [`TS${String(code)}`, safety]),
    ),
  ),
  ...listed('dead-code', Object.entries(DEAD_CODE_RULES)),
  ...listed(
    'ruff',
    [
      ...RUFF_PROMOTED_FIXES.map((code): [string, string] => [code, SAFE]),
      ...REVIEW_CODES.map((code): [string, string] => [code, REVIEW]),
    ],
    ['python'],
  ),
]);
