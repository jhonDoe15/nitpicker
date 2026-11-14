import { REVIEW, SAFE } from './safety.mjs';

const SCOPES = new Set(['file', 'project']);
const SAFETY = new Set([SAFE, REVIEW]);

function invalid(recipe, problem) {
  return new Error(`Recipe ${recipe?.id ?? '(no id)'} ${problem}`);
}

function checkRules(recipe) {
  const rules = recipe.rules;
  if (!Array.isArray(rules) || rules.length === 0) {
    throw invalid(recipe, 'lists no rules');
  }
  if (rules.some(({ tool, rule } = {}) => typeof tool !== 'string' || typeof rule !== 'string')) {
    throw invalid(recipe, 'lists a rule without a tool and a rule id');
  }
}

export function checkRecipe(recipe) {
  if (typeof recipe?.id !== 'string' || recipe.id === '') {
    throw invalid(recipe, 'has no id');
  }
  checkRules(recipe);
  if (!Array.isArray(recipe.presets) || recipe.presets.length === 0) {
    throw invalid(recipe, 'lists no presets');
  }
  if (!SCOPES.has(recipe.scope)) {
    throw invalid(recipe, `has scope ${recipe.scope}, not file or project`);
  }
  if (!SAFETY.has(recipe.safety)) {
    throw invalid(recipe, `has safety ${recipe.safety}, not safe or review`);
  }
  if (typeof recipe.plan !== 'function') {
    throw invalid(recipe, 'has no plan function');
  }
  return recipe;
}

export function defineRecipes(recipes) {
  const ids = new Set();
  for (const recipe of recipes) {
    checkRecipe(recipe);
    if (ids.has(recipe.id)) {
      throw invalid(recipe, 'is defined twice');
    }
    ids.add(recipe.id);
  }
  return Object.freeze([...recipes]);
}

export function ruleName({ tool, rule }) {
  return `${tool}/${rule}`;
}

export function activeRecipes(recipes, { preset, selectedRules = [] }) {
  const selected = new Set(selectedRules);
  return recipes.filter(
    (recipe) =>
      recipe.presets.includes(preset) &&
      (selected.size === 0
        ? recipe.safety === SAFE
        : recipe.rules.some((rule) => selected.has(ruleName(rule)))),
  );
}
