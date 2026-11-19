import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode, resolveFunction } from '../analysis/constant-resolution.mts';
import { importedBindings } from '../security/imported-names.mts';
import type { Context } from '../security/security-values.mts';
import { nodeChildren } from '../typed/node-views.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

export type BatchFunction =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
export type Batch = { readonly fn: BatchFunction; readonly keys: string };

const PACKAGE = 'dataloader';

export function batchOf(construct: TSESTree.NewExpression, context: Context): Batch | undefined {
  const { callee } = construct;
  if (callee.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const binding = importedBindings(context.sourceCode.ast).get(callee.name);
  if (binding?.module !== PACKAGE) {
    return undefined;
  }
  const [first] = construct.arguments;
  const fn = isFunctionNode(first) ? first : resolveFunction(context, first);
  const [param] = isFunctionNode(fn) ? fn.params : [];
  return isFunctionNode(fn) && param?.type === AST_NODE_TYPES.Identifier
    ? { fn, keys: param.name }
    : undefined;
}

export function returnedValues(fn: BatchFunction): TSESTree.Node[] {
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return [fn.body];
  }
  const found: TSESTree.Node[] = [];
  const pending: TSESTree.Node[] = [...fn.body.body];
  for (const node of pending) {
    if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument !== null) {
      found.push(node.argument);
    } else if (!isFunctionNode(node)) {
      appendAll(pending, nodeChildren(node));
    }
  }
  return found;
}
