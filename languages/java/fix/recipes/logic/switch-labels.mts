import { readSwitchLabelFixes as untypedReadSwitchLabelFixes } from '../../../adapters/near-duplicates/jvm-trees.mjs';
import type { FixRecipe, RecipePlan } from '../../../../../core/fix/typed/fix-types.mts';
import { treeFixRecipe } from './tree-fix-recipe.mts';

const readSwitchLabelFixes: (
  projectRoot: string | undefined,
  texts: Readonly<Record<string, string>>,
) => RecipePlan = untypedReadSwitchLabelFixes;

export const switchLabelsRecipe: FixRecipe = treeFixRecipe({
  id: 'jvm-merge-switch-labels',
  rule: 'duplicate-branch',
  read: readSwitchLabelFixes,
});
