import { defineRecipes } from './recipes.mjs';
import { JVM_RECIPES } from '../../../languages/java/fix/recipes/jvm-recipes.mjs';

export const ALL_RECIPES = defineRecipes([...JVM_RECIPES]);
