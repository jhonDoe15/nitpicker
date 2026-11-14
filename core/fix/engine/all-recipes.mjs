import { defineRecipes } from './recipes.mjs';
import { SHARED_RECIPES } from '../recipes/shared-recipes.mjs';
import { JVM_RECIPES } from '../../../languages/java/fix/recipes/jvm-recipes.mjs';
import { errorProneRecipes } from '../../../languages/java/fix/errorprone/recipes/error-prone-recipes.mjs';
import { PYTHON_RECIPES } from '../../../languages/python/fix/recipes/python-recipes.mjs';
import { TYPESCRIPT_RECIPES } from '../../../languages/typescript/fix/recipes/typescript-recipes.mjs';

export const ALL_RECIPES = defineRecipes([
  ...JVM_RECIPES,
  ...errorProneRecipes(new Map()),
  ...PYTHON_RECIPES,
  ...TYPESCRIPT_RECIPES,
  ...SHARED_RECIPES,
]);
