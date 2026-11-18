import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { CORE_RECIPES } from '../core-recipe-facts.mts';
import { coreRuleRecipe, type CorePlan, type CoreRequest } from '../core-rule-recipe.mts';
import { hasComment, isInStatementList, withOwnLines } from '../text-ranges.mts';
import { isInertValue } from './inert-values.mts';

const EFFECTS = 'the stored value may have effects, so removing it is for a person to decide';

function droppedStore({ text, sourceCode, node }: CoreRequest): CorePlan {
  const { parent } = node;
  if (
    parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id === node &&
    parent.init !== null
  ) {
    if (!isInertValue(parent.init)) {
      return { declined: EFFECTS };
    }
    const range = { start: parent.id.range[1], end: parent.init.range[1] };
    return hasComment(sourceCode, range)
      ? { declined: 'a comment sits in the initializer' }
      : { edits: [{ ...range, text: '' }] };
  }
  const statement = parent?.parent;
  if (
    parent?.type !== AST_NODE_TYPES.AssignmentExpression ||
    parent.operator !== '=' ||
    parent.left !== node ||
    statement?.type !== AST_NODE_TYPES.ExpressionStatement
  ) {
    return { declined: 'the store is not a plain assignment statement or declaration' };
  }
  if (!isInStatementList(statement)) {
    return { declined: 'the assignment is the only statement of a branch or loop' };
  }
  if (!isInertValue(parent.right)) {
    return { declined: EFFECTS };
  }
  const [start, end] = statement.range;
  return hasComment(sourceCode, { start, end })
    ? { declined: 'a comment sits in the assignment' }
    : { edits: [{ ...withOwnLines(text, { start, end }), text: '' }] };
}

export const uselessAssignmentRecipe = coreRuleRecipe(CORE_RECIPES.uselessAssignment, droppedStore);
