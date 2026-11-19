import { defineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import { PROJECT_RECIPES } from '../project/project-recipes.mts';
import { CORE_RULE_RECIPES } from './core/core-recipes.mts';
import { typescriptRestatingDocCommentRecipe } from './restating-doc-comment.mts';

export const TYPESCRIPT_RECIPES = defineRecipes([
  typescriptRestatingDocCommentRecipe,
  ...CORE_RULE_RECIPES,
  ...PROJECT_RECIPES,
]);
