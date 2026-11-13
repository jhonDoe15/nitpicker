import { commentedOutCode } from '../../../../adapters/kotlin/scan/rules/markers.mjs';
import { kotlinRecipe } from '../shared/kotlin-recipe.mjs';
import { removalSpan } from '../shared/spans.mjs';

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
