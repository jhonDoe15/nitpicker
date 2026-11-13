import { defineRecipes } from './recipes.mjs';
import { JVM_RECIPES } from '../../../languages/java/fix/recipes/jvm-recipes.mjs';
import { PYTHON_RECIPES } from '../../../languages/python/fix/source/python-recipes.mjs';

export const ALL_RECIPES = defineRecipes([...JVM_RECIPES, ...PYTHON_RECIPES]);
