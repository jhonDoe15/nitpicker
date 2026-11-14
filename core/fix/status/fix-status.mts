import { ALL_RECIPES } from '../engine/all-recipes.mts';
import { FIX_PLAN_RULES } from './fix-plan-rules.mts';
import { FORMATTER_RULES } from './tool-fixers.mts';
import { SELECTED_FIXER_RULES } from './selected-fixers.mts';
import { presetsOf } from '../../../shared/reference/facts.mjs';
import { FIX_RANK, FIX_STATUS } from '../../../shared/reference/fix-status.mjs';
import { matcherOf, presetRules, recipeListings, type Fields } from './status-types.mts';
import type {
  FixStatusSources,
  PresetRule,
  RecipeListing,
  RuleMatcher,
  RuleRef,
} from '../typed/fix-types.mts';

export const DEFAULT_FIX_SOURCES: FixStatusSources = {
  recipes: recipeListings(ALL_RECIPES),
  formatters: FORMATTER_RULES,
  selected: SELECTED_FIXER_RULES,
  plans: presetRules(FIX_PLAN_RULES),
};

function namesRule(entry: RuleMatcher, { tool, rule }: RuleRef) {
  const tools = [entry.tool, ...(entry.findingTools ?? [])];
  if (!tools.includes(tool)) {
    return false;
  }
  return entry.pattern === undefined
    ? entry.rule === rule
    : entry.rule === rule || new RegExp(entry.pattern, 'u').test(rule);
}

function recipeStatus(entry: RuleMatcher, preset: string, recipes: readonly RecipeListing[]) {
  const own = recipes.filter(
    ({ presets, rules }) =>
      presets.includes(preset) && rules.some((rule) => namesRule(entry, rule)),
  );
  if (own.some(({ safety }) => safety === 'safe')) {
    return FIX_STATUS.automatic;
  }
  return own.length === 0 ? FIX_STATUS.none : FIX_STATUS.review;
}

function isListed(entry: RuleMatcher, preset: string, rules: readonly PresetRule[]) {
  return rules.some(({ presets, ...rule }) => presets.includes(preset) && namesRule(entry, rule));
}

function toolFixerStatus(entry: RuleMatcher, preset: string, formatters: readonly PresetRule[]) {
  return entry.fixableIn?.includes(preset) || isListed(entry, preset, formatters)
    ? FIX_STATUS.automatic
    : FIX_STATUS.none;
}

function selectedFixerStatus(
  entry: RuleMatcher,
  preset: string,
  selected: readonly PresetRule[] = [],
) {
  const own = selected.filter(
    ({ presets, ...rule }) => presets.includes(preset) && namesRule(entry, rule),
  );
  if (own.some(({ safety }) => safety === 'safe')) {
    return FIX_STATUS.automatic;
  }
  return own.length === 0 ? FIX_STATUS.none : FIX_STATUS.review;
}

export function fixStatusFor(
  entry: RuleMatcher,
  preset: string,
  sources: FixStatusSources = DEFAULT_FIX_SOURCES,
): string | undefined {
  const statuses = [
    recipeStatus(entry, preset, sources.recipes),
    toolFixerStatus(entry, preset, sources.formatters),
    selectedFixerStatus(entry, preset, sources.selected),
    isListed(entry, preset, sources.plans) ? FIX_STATUS.plan : FIX_STATUS.none,
  ];
  return FIX_RANK.findLast((status) => statuses.includes(status));
}

export function withFixStatus(
  { fixableIn, ...entry }: Fields,
  sources: FixStatusSources = DEFAULT_FIX_SOURCES,
): Fields {
  const withHint = matcherOf({ ...entry, fixableIn });
  return {
    ...entry,
    fix: Object.fromEntries(
      presetsOf(entry).map((preset) => [preset, fixStatusFor(withHint, preset, sources)]),
    ),
  };
}
