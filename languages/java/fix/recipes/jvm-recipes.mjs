import { defineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import { kotlinFinalNewlineRecipe } from './final-newline.mjs';
import { SPRING_CONFIG_RECIPES } from './spring/config/config-recipes.mjs';
import { missingEnableRecipe } from './spring/enable/missing-enable.mjs';
import { upperEllRecipe } from './upper-ell.mjs';

export const JVM_RECIPES = defineRecipes([
  upperEllRecipe,
  kotlinFinalNewlineRecipe,
  ...SPRING_CONFIG_RECIPES,
  missingEnableRecipe,
]);
