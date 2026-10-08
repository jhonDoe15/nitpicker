import { strictBoundaryRules } from './architecture/strict-boundary-rules.mjs';
import { strictPresetConfig } from './eslint-config/strict.mjs';
import { defaultResolvedLayout } from './layout.mjs';

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
 * that the strict rules do not replace keep the plain baseline comparison.
 */
export function isStrictRule(rule) {
  return strictRuleIds.has(rule);
}
