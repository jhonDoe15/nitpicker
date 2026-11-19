import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { CORE_RECIPES } from '../core-recipe-facts.mts';
import { coreRuleRecipe, type CorePlan, type CoreRequest } from '../core-rule-recipe.mts';
import { withOwnLines } from '../text-ranges.mts';

function removedBlock({ text, node }: CoreRequest): CorePlan {
  if (node.type !== AST_NODE_TYPES.StaticBlock) {
    return { declined: 'the empty block is not a static block' };
  }
  const [start, end] = node.range;
  return { edits: [{ ...withOwnLines(text, { start, end }), text: '' }] };
}

export const emptyStaticBlockRecipe = coreRuleRecipe(CORE_RECIPES.emptyStaticBlock, removedBlock);
