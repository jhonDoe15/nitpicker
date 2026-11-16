import { defineRecipes } from './recipes.mjs';
import { SHARED_RECIPES } from '../recipes/shared-recipes.mjs';
import { JVM_RECIPES } from '../../../languages/java/fix/recipes/jvm-recipes.mts';
import { errorProneRecipes } from '../../../languages/java/fix/errorprone/recipes/error-prone-recipes.mts';
import { PYTHON_RECIPES } from '../../../languages/python/fix/recipes/python-recipes.mts';
import { TYPESCRIPT_RECIPES } from '../../../languages/typescript/fix/recipes/typescript-recipes.mts';
import { concatenated } from '../typed/fix-types.mts';

export const ALL_RECIPES = defineRecipes(
  concatenated(
    JVM_RECIPES,
    errorProneRecipes(new Map()),
    PYTHON_RECIPES,
    TYPESCRIPT_RECIPES,
    SHARED_RECIPES,
  ),
);
