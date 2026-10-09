import { isJavaTouchedRule } from '../adapters/java/touched-rules.mjs';
import { strictBoundaryRules } from './architecture/strict-boundary-rules.mjs';
import { strictPresetConfig } from './eslint-config/strict.mjs';
import { defaultResolvedLayout } from './layout.mjs';

// Prettier findings are per formatting hunk and held to the same touched-lines standard.
const PRETTIER_RULE = 'prettier/prettier';

const strictRuleIds = new Set([
  ...strictPresetConfig(defaultResolvedLayout, {}).flatMap((entry) =>
    Object.keys(entry.rules ?? {}),
  ),
  ...strictBoundaryRules.map(({ name }) => name),
]);

/**
 * True for the rules the strict preset owns: its ESLint rules and its dependency boundary rules.
 * The differential gate holds findings of these rules to the strict standard in touched code
 * (docs/typescript-strict-preset.md). Descriptive metrics and the rules of third-party presets
 * that the strict rules do not replace keep the plain baseline comparison. The Java preset's
 * `changed-branch-coverage` (see adapters/java/touched-rules.mjs) is held to the same standard.
 */
export function isStrictRule(rule, finding) {
  return strictRuleIds.has(rule) || rule === PRETTIER_RULE || isJavaTouchedRule(rule, finding);
}
