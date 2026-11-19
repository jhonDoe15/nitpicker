import { readShorterConditionFixes } from '../../../adapters/near-duplicates/jvm-trees.mts';
import type { FixRecipe } from '../../../../../core/fix/typed/fix-types.mts';
import { treeFixRecipe } from './tree-fix-recipe.mts';

export const shorterConditionRecipe: FixRecipe = treeFixRecipe({
  id: 'jvm-shorter-condition',
  rule: 'shorter-condition',
  read: readShorterConditionFixes,
});
