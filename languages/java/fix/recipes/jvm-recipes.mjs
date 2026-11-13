import { defineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import { kotlinFinalNewlineRecipe } from './final-newline.mjs';
import { upperEllRecipe } from './upper-ell.mjs';

export const JVM_RECIPES = defineRecipes([upperEllRecipe, kotlinFinalNewlineRecipe]);
