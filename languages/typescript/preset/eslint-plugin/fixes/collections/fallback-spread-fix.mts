import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../rules/security/security-values.mts';
import { hasCommentIn, replacing, type FixPlan } from '../support/ranges.mts';
import { isScriptFile } from './support/script-files.mts';
import { canSpreadValue } from './support/spread-types.mts';

export function fallbackSpreadFix(
  context: Context,
  spread: TSESTree.SpreadElement,
  logical: TSESTree.LogicalExpression,
): FixPlan | undefined {
  const { sourceCode } = context;
  const { left } = logical;
  const dots = sourceCode.getFirstToken(spread);
  const first = dots === null ? null : sourceCode.getTokenAfter(dots);
  const last = sourceCode.getLastToken(spread);
  const plain =
    spread.argument === logical &&
    left.type !== AST_NODE_TYPES.SequenceExpression &&
    !hasCommentIn(sourceCode, spread.range);
  if (!plain || first === null || last === null) {
    return undefined;
  }
  if (!isScriptFile(context.filename) && !canSpreadValue(context, left)) {
    return undefined;
  }
  return replacing([first.range[0], last.range[1]], sourceCode.getText(left));
}
