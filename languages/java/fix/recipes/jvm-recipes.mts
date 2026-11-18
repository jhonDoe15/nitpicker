import { defineRecipes as untypedDefineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import type { FixRecipe } from '../../../../core/fix/typed/fix-types.mts';
import { kotlinFinalNewlineRecipe } from './final-newline.mts';
import { SPRING_CONFIG_RECIPES } from './spring/config/config-recipes.mts';
import { missingEnableRecipe } from './spring/enable/missing-enable.mts';
import { explicitGcRecipe } from './kotlin/calls/explicit-gc.mts';
import { useCheckNotNullRecipe, useRequireNotNullRecipe } from './kotlin/contracts/not-null.mts';
import { useCheckOrErrorRecipe, useRequireRecipe } from './kotlin/contracts/preconditions.mts';
import { emptyBlocksRecipe } from './kotlin/declarations/empty-blocks.mts';
import { unusedPrivateRecipe } from './kotlin/declarations/unused-private.mts';
import { varCouldBeValRecipe } from './kotlin/declarations/var-could-be-val.mts';
import { explicitItRecipe } from './kotlin/idioms/explicit-it.mts';
import { useIsNullOrEmptyRecipe, useOrEmptyRecipe } from './kotlin/idioms/null-or-empty.mts';
import { unnecessaryLetRecipe } from './kotlin/idioms/unnecessary-let.mts';
import { catchLogRecipe } from './kotlin/logging/catch-log.mts';
import { logConcatenationRecipe } from './kotlin/logging/log-concatenation.mts';
import {
  generatedMarkerRecipe,
  jvmSyntheticRecipe,
  mutationIgnoreRecipe,
} from './kotlin/markers/annotation-markers.mts';
import { commentedCodeRecipe } from './kotlin/markers/commented-code.mts';
import { mayBeConstRecipe, mayBeConstReviewRecipe } from './kotlin/modifiers/may-be-const.mts';
import { modifierOrderRecipe } from './kotlin/modifiers/modifier-order.mts';
import { optionalAbstractRecipe } from './kotlin/modifiers/optional-abstract.mts';
import { sortForExtremeRecipe } from './kotlin/performance/collections/sort-for-extreme.mts';
import { plainTextRegexRecipe } from './kotlin/performance/regexes/plain-text-regex.mts';
import { saveInLoopRecipe } from './kotlin/performance/repositories/loops/save-in-loop.mts';
import { focusedTestRecipe } from './kotlin/tests/focused-tests.mts';
import { validationTargetRecipe } from './kotlin/validation/validation-target.mts';
import {
  javaRestatingDocCommentRecipe,
  kotlinRestatingDocCommentRecipe,
} from './restating-doc-comment.mts';
import { upperEllRecipe } from './upper-ell.mts';
import { javaExtractNearDuplicateRecipe } from './extract/near-duplicate-extract.mts';
import { javaExtractPartialRunRecipe } from './extract/partial/partial-run-extract.mts';

const defineRecipes: (recipes: readonly FixRecipe[]) => readonly FixRecipe[] = untypedDefineRecipes;

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
  explicitGcRecipe,
  modifierOrderRecipe,
  optionalAbstractRecipe,
  sortForExtremeRecipe,
  plainTextRegexRecipe,
  saveInLoopRecipe,
  focusedTestRecipe,
  validationTargetRecipe,
  javaRestatingDocCommentRecipe,
  kotlinRestatingDocCommentRecipe,
  javaExtractNearDuplicateRecipe,
  javaExtractPartialRunRecipe,
]);
