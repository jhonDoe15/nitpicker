import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import {
  CORE_RECIPES,
  recipeFields,
  type CoreFacts,
  type FileRecipe,
  type PlanContext,
  type Planned,
} from './core-recipe-facts.mts';

type Plan = (context: PlanContext) => Planned;

const require = createRequire(import.meta.url);
const EXTENSION = path.extname(fileURLToPath(import.meta.url));

function isPlan(value: unknown): value is Plan {
  return typeof value === 'function';
}

function loadedPlan({ module, name }: CoreFacts): Plan {
  const recipe: unknown = fieldOf(require(`./${module}${EXTENSION}`), name);
  const plan = fieldOf(recipe, 'plan');
  if (!isPlan(plan)) {
    throw new TypeError(`${module} has no recipe ${name}`);
  }
  return plan;
}

function lazyRecipe(facts: CoreFacts): FileRecipe {
  return { ...recipeFields(facts), plan: (context) => loadedPlan(facts)(context) };
}

export const CORE_RULE_RECIPES: readonly FileRecipe[] = Object.values(CORE_RECIPES).map(lazyRecipe);
