import { defineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import { typescriptRestatingDocCommentRecipe } from './restating-doc-comment.mjs';

export const TYPESCRIPT_RECIPES = defineRecipes([typescriptRestatingDocCommentRecipe]);
