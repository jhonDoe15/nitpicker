import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../rules/security/security-values.mts';
import { containsNode } from '../support/nodes.mts';
import { hasCommentIn, replacing, type FixPlan } from '../support/ranges.mts';
import { isGlobalName } from './support/globals.mts';

const TRANSACTION = /transaction/iu;
const WRITES = new Set<string>([
  AST_NODE_TYPES.AssignmentExpression,
  AST_NODE_TYPES.UpdateExpression,
]);

function isTransactional(context: Context, node: TSESTree.Node): boolean {
  const { sourceCode } = context;
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return TRANSACTION.test(sourceCode.getText(node.callee));
  }
  const decorators = 'decorators' in node ? node.decorators : [];
  return decorators.some((decorator) => TRANSACTION.test(sourceCode.getText(decorator)));
}

function insideTransaction(context: Context, node: TSESTree.Node): boolean {
  for (
    let current: TSESTree.Node | null | undefined = node.parent;
    current;
    current = current.parent
  ) {
    if (isTransactional(context, current)) {
      return true;
    }
  }
  return false;
}

function writesAnything(context: Context, list: TSESTree.ArrayExpression): boolean {
  return list.elements.some(
    (element) =>
      element !== null &&
      containsNode(context.sourceCode, element, {
        matches: (node) => WRITES.has(node.type),
        intoFunctions: true,
      }),
  );
}

export function mayRunTogether(context: Context, call: TSESTree.CallExpression): boolean {
  const [list] = call.arguments;
  return (
    list?.type === AST_NODE_TYPES.ArrayExpression &&
    isGlobalName(context, call, 'Promise') &&
    !insideTransaction(context, call) &&
    !writesAnything(context, list)
  );
}

export function dropAwaitFix(
  context: Context,
  element: TSESTree.AwaitExpression,
): FixPlan | undefined {
  const { sourceCode } = context;
  const next = sourceCode.getTokenAfter(sourceCode.getFirstToken(element) ?? element);
  if (next === null) {
    return undefined;
  }
  const range: TSESTree.Range = [element.range[0], next.range[0]];
  return hasCommentIn(sourceCode, range) ? undefined : replacing(range, '');
}
