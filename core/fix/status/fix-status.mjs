import { ALL_RECIPES } from '../engine/all-recipes.mjs';
import { FIX_PLAN_RULES } from './fix-plan-rules.mjs';
import { FORMATTER_RULES } from './tool-fixers.mjs';
import { SELECTED_FIXER_RULES } from './selected-fixers.mjs';
import { presetsOf } from '../../../shared/reference/facts.mjs';
import { FIX_RANK, FIX_STATUS } from '../../../shared/reference/fix-status.mjs';

export const DEFAULT_FIX_SOURCES = {
  recipes: ALL_RECIPES,
  formatters: FORMATTER_RULES,
  selected: SELECTED_FIXER_RULES,
  plans: FIX_PLAN_RULES,
};

function namesRule(entry, { tool, rule }) {
  const tools = [entry.tool, ...(entry.findingTools ?? [])];
  if (!tools.includes(tool)) {
    return false;
  }
  return entry.pattern === undefined
    ? entry.rule === rule
    : entry.rule === rule || new RegExp(entry.pattern, 'u').test(rule);
}

function recipeStatus(entry, preset, recipes) {
  const own = recipes.filter(
    ({ presets, rules }) =>
      presets.includes(preset) && rules.some((rule) => namesRule(entry, rule)),
  );
  if (own.some(({ safety }) => safety === 'safe')) {
    return FIX_STATUS.automatic;
  }
  return own.length === 0 ? FIX_STATUS.none : FIX_STATUS.review;
}

function isListed(entry, preset, rules) {
  return rules.some(({ presets, ...rule }) => presets.includes(preset) && namesRule(entry, rule));
}

function toolFixerStatus(entry, preset, formatters) {
  return entry.fixableIn?.includes(preset) || isListed(entry, preset, formatters)
    ? FIX_STATUS.automatic
    : FIX_STATUS.none;
}

function selectedFixerStatus(entry, preset, selected = []) {
  const own = selected.filter(
    ({ presets, ...rule }) => presets.includes(preset) && namesRule(entry, rule),
  );
  if (own.some(({ safety }) => safety === 'safe')) {
    return FIX_STATUS.automatic;
  }
  return own.length === 0 ? FIX_STATUS.none : FIX_STATUS.review;
}

export function fixStatusFor(entry, preset, sources = DEFAULT_FIX_SOURCES) {
  const statuses = [
    recipeStatus(entry, preset, sources.recipes),
    toolFixerStatus(entry, preset, sources.formatters),
    selectedFixerStatus(entry, preset, sources.selected),
    isListed(entry, preset, sources.plans) ? FIX_STATUS.plan : FIX_STATUS.none,
  ];
  return FIX_RANK.findLast((status) => statuses.includes(status));
}

export function withFixStatus({ fixableIn, ...entry }, sources = DEFAULT_FIX_SOURCES) {
  const withHint = { ...entry, fixableIn };
  return {
    ...entry,
    fix: Object.fromEntries(
      presetsOf(entry).map((preset) => [preset, fixStatusFor(withHint, preset, sources)]),
    ),
  };
}
