import { untrackCommittedFilesRecipe } from '../../../shared/fix/recipes/hygiene/untrack-recipe.mjs';
import { defineRecipes } from '../engine/recipes.mts';

export const SHARED_RECIPES = defineRecipes([untrackCommittedFilesRecipe]);
