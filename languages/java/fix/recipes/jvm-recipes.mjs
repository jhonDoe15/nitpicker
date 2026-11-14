import { defineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import { kotlinFinalNewlineRecipe } from './final-newline.mjs';
import { SPRING_CONFIG_RECIPES } from './spring/config/config-recipes.mjs';
import { missingEnableRecipe } from './spring/enable/missing-enable.mjs';
import { useCheckNotNullRecipe, useRequireNotNullRecipe } from './kotlin/contracts/not-null.mjs';
import { useCheckOrErrorRecipe, useRequireRecipe } from './kotlin/contracts/preconditions.mjs';
import { emptyBlocksRecipe } from './kotlin/declarations/empty-blocks.mjs';
import { unusedPrivateRecipe } from './kotlin/declarations/unused-private.mjs';
import { varCouldBeValRecipe } from './kotlin/declarations/var-could-be-val.mjs';
import { explicitItRecipe } from './kotlin/idioms/explicit-it.mjs';
import { useIsNullOrEmptyRecipe, useOrEmptyRecipe } from './kotlin/idioms/null-or-empty.mjs';
import { unnecessaryLetRecipe } from './kotlin/idioms/unnecessary-let.mjs';
import { catchLogRecipe } from './kotlin/logging/catch-log.mjs';
import { logConcatenationRecipe } from './kotlin/logging/log-concatenation.mjs';
import {
  generatedMarkerRecipe,
  jvmSyntheticRecipe,
  mutationIgnoreRecipe,
} from './kotlin/markers/annotation-markers.mjs';
import { commentedCodeRecipe } from './kotlin/markers/commented-code.mjs';
import { mayBeConstRecipe, mayBeConstReviewRecipe } from './kotlin/modifiers/may-be-const.mjs';
import { modifierOrderRecipe } from './kotlin/modifiers/modifier-order.mjs';
import { optionalAbstractRecipe } from './kotlin/modifiers/optional-abstract.mjs';
import { focusedTestRecipe } from './kotlin/tests/focused-tests.mjs';
import { validationTargetRecipe } from './kotlin/validation/validation-target.mjs';
import {
  javaRestatingDocCommentRecipe,
  kotlinRestatingDocCommentRecipe,
} from './restating-doc-comment.mjs';
import { upperEllRecipe } from './upper-ell.mjs';
import { javaExtractNearDuplicateRecipe } from './extract/near-duplicate-extract.mjs';
import { javaExtractPartialRunRecipe } from './extract/partial/partial-run-extract.mjs';

export const JVM_RECIPES = defineRecipes([
  upperEllRecipe,
  kotlinFinalNewlineRecipe,
  ...SPRING_CONFIG_RECIPES,
  missingEnableRecipe,
  useRequireRecipe,
  useCheckOrErrorRecipe,
  useRequireNotNullRecipe,
  useCheckNotNullRecipe,
  emptyBlocksRecipe,
  unusedPrivateRecipe,
  varCouldBeValRecipe,
  explicitItRecipe,
  useIsNullOrEmptyRecipe,
  useOrEmptyRecipe,
  unnecessaryLetRecipe,
  catchLogRecipe,
  logConcatenationRecipe,
  generatedMarkerRecipe,
  jvmSyntheticRecipe,
  mutationIgnoreRecipe,
  commentedCodeRecipe,
  mayBeConstRecipe,
  mayBeConstReviewRecipe,
  modifierOrderRecipe,
  optionalAbstractRecipe,
  focusedTestRecipe,
  validationTargetRecipe,
  javaRestatingDocCommentRecipe,
  kotlinRestatingDocCommentRecipe,
  javaExtractNearDuplicateRecipe,
  javaExtractPartialRunRecipe,
]);
