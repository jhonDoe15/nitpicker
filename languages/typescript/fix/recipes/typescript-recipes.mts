import { defineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import { PROJECT_RECIPES } from '../project/project-recipes.mts';
import { uselessCallRecipe } from './core/expressions/useless-call.mts';
import { uselessConcatRecipe } from './core/expressions/useless-concat.mts';
import { duplicateImportsRecipe } from './core/modules/duplicate-imports.mts';
import { uselessCatchRecipe } from './core/statements/useless-catch.mts';
import { unreachableRecipe } from './core/statements/unreachable.mts';
import { uselessAssignmentRecipe } from './core/statements/useless-assignment.mts';
import { emptyStaticBlockRecipe } from './core/statements/empty-static-block.mts';
import { typescriptRestatingDocCommentRecipe } from './restating-doc-comment.mts';

export const TYPESCRIPT_RECIPES = defineRecipes([
  typescriptRestatingDocCommentRecipe,
  emptyStaticBlockRecipe,
  uselessConcatRecipe,
  uselessCatchRecipe,
  uselessCallRecipe,
  duplicateImportsRecipe,
  unreachableRecipe,
  uselessAssignmentRecipe,
  ...PROJECT_RECIPES,
]);
