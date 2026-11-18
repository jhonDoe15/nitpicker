import { readShorterConditionFixes as untypedReadShorterConditionFixes } from '../../../adapters/near-duplicates/jvm-trees.mjs';
import type { FixRecipe, RecipePlan } from '../../../../../core/fix/typed/fix-types.mts';
import { treeFixRecipe } from './tree-fix-recipe.mts';

const readShorterConditionFixes: (
  projectRoot: string | undefined,
  texts: Readonly<Record<string, string>>,
) => RecipePlan = untypedReadShorterConditionFixes;

export const shorterConditionRecipe: FixRecipe = treeFixRecipe({
  id: 'jvm-shorter-condition',
  rule: 'shorter-condition',
  read: readShorterConditionFixes,
});
