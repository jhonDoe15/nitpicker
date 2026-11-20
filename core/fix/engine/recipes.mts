import { fieldOf, isText, listOf, textOf } from '../../../shared/values/readers.mts';
import { REVIEW, SAFE } from './safety.mts';
import type { FixRecipe } from '../typed/fix-types.mts';

const SCOPES = new Set<unknown>(['file', 'project']);
const SAFETY = new Set<unknown>([SAFE, REVIEW]);

function invalid(recipe: unknown, problem: string): Error {
  return new Error(`Recipe ${textOf(fieldOf(recipe, 'id') ?? '(no id)')} ${problem}`);
}

function checkRules(recipe: unknown): void {
  const rules = fieldOf(recipe, 'rules');
  if (!Array.isArray(rules) || rules.length === 0) {
    throw invalid(recipe, 'lists no rules');
  }
  if (
    listOf(rules).some(
      (entry) =>
        typeof fieldOf(entry, 'tool') !== 'string' || typeof fieldOf(entry, 'rule') !== 'string',
    )
  ) {
    throw invalid(recipe, 'lists a rule without a tool and a rule id');
  }
}

function isFixRecipe(value: unknown): value is FixRecipe {
  return typeof value === 'object' && value !== null;
}

function checkShape(recipe: unknown): void {
  const presets = fieldOf(recipe, 'presets');
  if (!Array.isArray(presets) || presets.length === 0) {
    throw invalid(recipe, 'lists no presets');
  }
  const scope = fieldOf(recipe, 'scope');
  if (!SCOPES.has(scope)) {
    throw invalid(recipe, `has scope ${textOf(scope)}, not file or project`);
  }
  const safety = fieldOf(recipe, 'safety');
  if (!SAFETY.has(safety)) {
    throw invalid(recipe, `has safety ${textOf(safety)}, not safe or review`);
  }
  if (typeof fieldOf(recipe, 'plan') !== 'function') {
    throw invalid(recipe, 'has no plan function');
  }
}

export function checkRecipe(recipe: unknown): FixRecipe {
  const id = fieldOf(recipe, 'id');
  if (!isText(id) || id === '') {
    throw invalid(recipe, 'has no id');
  }
  checkRules(recipe);
  checkShape(recipe);
  if (!isFixRecipe(recipe)) {
    throw invalid(recipe, 'is not an object');
  }
  return recipe;
}

export function defineRecipes(recipes: readonly unknown[]): readonly FixRecipe[] {
  const ids = new Set<string>();
  const checked: FixRecipe[] = [];
  for (const recipe of recipes) {
    const valid = checkRecipe(recipe);
    if (ids.has(valid.id)) {
      throw invalid(recipe, 'is defined twice');
    }
    ids.add(valid.id);
    checked.push(valid);
  }
  return Object.freeze(checked);
}

export function ruleName({ tool, rule }: { readonly tool: string; readonly rule: string }): string {
  return `${tool}/${rule}`;
}

export function activeRecipes(
  recipes: readonly unknown[],
  {
    preset,
    selectedRules = [],
  }: { readonly preset: string; readonly selectedRules?: readonly string[] | undefined },
): FixRecipe[] {
  const selected = new Set(selectedRules);
  return recipes
    .filter(isFixRecipe)
    .filter(
      (recipe) =>
        recipe.presets.includes(preset) &&
        (selected.size === 0
          ? recipe.safety === SAFE
          : recipe.rules.some((rule) => selected.has(ruleName(rule)))),
    );
}
