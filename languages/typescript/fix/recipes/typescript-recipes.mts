import { defineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import { PROJECT_RECIPES } from '../project/project-recipes.mts';
import { uselessConcatRecipe } from './core/expressions/useless-concat.mts';
import { uselessCatchRecipe } from './core/statements/useless-catch.mts';
import { emptyStaticBlockRecipe } from './core/statements/empty-static-block.mts';
import { typescriptRestatingDocCommentRecipe } from './restating-doc-comment.mts';

export const TYPESCRIPT_RECIPES = defineRecipes([
  typescriptRestatingDocCommentRecipe,
  emptyStaticBlockRecipe,
  uselessConcatRecipe,
  uselessCatchRecipe,
  ...PROJECT_RECIPES,
]);
