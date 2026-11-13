import { defineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import { PROJECT_RECIPES } from '../project/project-recipes.mjs';
import { typescriptRestatingDocCommentRecipe } from './restating-doc-comment.mjs';

export const TYPESCRIPT_RECIPES = defineRecipes([
  typescriptRestatingDocCommentRecipe,
  ...PROJECT_RECIPES,
]);
