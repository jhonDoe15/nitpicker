import { untrackCommittedFilesRecipe } from '../../../shared/fix/recipes/hygiene/untrack-recipe.mjs';
import { defineRecipes } from '../engine/recipes.mjs';

export const SHARED_RECIPES = defineRecipes([untrackCommittedFilesRecipe]);
