import {
  codeFixes,
  'typescript-typecheck',
} from '../../../languages/typescript/fix/code-fixes/code-fix-rules.mjs';
import { suggestionRules } from '../../../languages/typescript/fix/suggestions/suggestion-rules.mjs';

const TYPESCRIPT_PRESETS = ['typescript', 'javascript'];

const DEAD_CODE_RULES = Object.freeze({
  exports: 'review',
  types: 'review',
  'unused-dependency': 'safe',
  files: 'review',
});

function listed(tool, entries) {
  return entries.map(([rule, safety]) => ({ tool, rule, safety, presets: TYPESCRIPT_PRESETS }));
}

export const SELECTED_FIXER_RULES = Object.freeze([
  ...listed('eslint-lint', Object.entries(suggestionRules)),
  ...listed(
    'typescript-typecheck',
    codeFixes.flatMap(({ codes, safety }) => codes.map((code) => [`TS${code}`, safety])),
  ),
  ...listed('dead-code', Object.entries(DEAD_CODE_RULES)),
]);
