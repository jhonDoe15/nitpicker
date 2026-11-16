import { defineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import { PROJECT_RECIPES } from '../project/project-recipes.mts';
import { typescriptRestatingDocCommentRecipe } from './restating-doc-comment.mts';

export const TYPESCRIPT_RECIPES = defineRecipes([
  typescriptRestatingDocCommentRecipe,
  ...PROJECT_RECIPES,
]);
