import { untrackCommittedFilesRecipe } from '../../../shared/fix/recipes/hygiene/untrack-recipe.mts';
import { defineRecipes } from '../engine/recipes.mts';

export const SHARED_RECIPES = defineRecipes([untrackCommittedFilesRecipe]);
