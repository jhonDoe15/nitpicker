import { didYouMean } from '../../../shared/messages/closest-match.mjs';
import { ruleName } from '../engine/recipes.mjs';
import { SELECTED_FIXER_RULES } from './selected-fixers.mts';
import { FORMATTER_RULES } from './tool-fixers.mts';
import { recipeListings, type Notes, type RecipeListing } from './status-types.mts';

function namesFor(preset: string, recipes: readonly RecipeListing[]) {
  return [
    ...new Set(
      [...recipes, ...SELECTED_FIXER_RULES, ...FORMATTER_RULES]
        .filter(({ presets }) => presets.includes(preset))
        .flatMap((entry) => ('rules' in entry ? entry.rules : [entry]).map(ruleName)),
    ),
  ];
}

function noteFor(rule: string, names: readonly string[], preset: string) {
  return names.includes(rule)
    ? `--fix --rule ${rule}: found nothing to fix`
    : `--fix --rule ${rule}: nitpicker has no fixer named ${rule} in the ${preset} preset${didYouMean(rule, names, '`')}`;
}

export function emptyRuleNotes({
  selectedRules,
  preset = 'typescript',
  recipes,
  result,
}: Notes): string[] {
  const printed = (result.notes ?? []).length > 0 || (result.fixedFiles ?? []).length > 0;
  if (printed || selectedRules.length === 0) {
    return [];
  }
  const names = namesFor(preset, recipeListings(recipes));
  return selectedRules.map((rule) => noteFor(rule, names, preset));
}
