import { readSwitchLabelFixes } from '../../../adapters/near-duplicates/jvm-trees.mts';
import type { FixRecipe } from '../../../../../core/fix/typed/fix-types.mts';
import { treeFixRecipe } from './tree-fix-recipe.mts';

export const switchLabelsRecipe: FixRecipe = treeFixRecipe({
  id: 'jvm-merge-switch-labels',
  rule: 'duplicate-branch',
  read: readSwitchLabelFixes,
});
