import { commentedOutCode as untypedCommentedOutCode } from '../../../../adapters/kotlin/scan/rules/markers.mts';
import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import type { KotlinMarker, ScannedKotlin } from '../shared/kotlin-scan.mts';
import { removalSpan } from '../shared/spans.mts';

const commentedOutCode: (scanned: ScannedKotlin) => readonly KotlinMarker[] =
  untypedCommentedOutCode;

export const commentedCodeRecipe = kotlinRecipe({
  id: 'kotlin-commented-out-code',
  rules: [{ tool: 'kotlin-source', rule: 'CommentedOutCode' }],
  where: 'both',
  find: (scanned) =>
    commentedOutCode(scanned).map(({ offset, end }) => ({
      offset,
      edits: [{ ...removalSpan(scanned.source, offset, end), text: '' }],
    })),
});
