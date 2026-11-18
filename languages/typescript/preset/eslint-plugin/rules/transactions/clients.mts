import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, isFunctionNode } from '../analysis/constant-resolution.mts';
import type { OpenerFunction } from '../effects/scopes/scope-types.mts';
import { childrenOf } from '../loops/loop-shapes.mts';
import type { Context } from '../security/security-values.mts';
import { estreeRunsWithCaller } from '../support/flow/sync-callbacks.mts';
import { callChain, rootNode } from '../support/orm/chains.mts';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';
import type { FunctionNode } from '../typed/syntax-views.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

export type ClientOrigin = 'transaction' | 'parameter' | 'other';
export type ClientScope = { readonly context: Context; readonly fn: FunctionNode };

const { DefinitionType } = TSESLint.Scope;
const TRANSACTION = 'transaction';
const OTHER = 'other';
const OPENERS = new Set([
  TRANSACTION,
  '$transaction',
  'transactional',
  'runInTransaction',
  'withTransaction',
  'inTransaction',
  'useTransaction',
]);
const MAX_DEPTH = 4;

function isOpenerFunction(fn: FunctionNode): fn is OpenerFunction {
  const call = fn.parent;
  if (
    call.type !== AST_NODE_TYPES.CallExpression ||
    !call.arguments.some((argument) => argument === fn)
  ) {
    return false;
  }
  const { callee } = call;
  const isMember = callee.type === AST_NODE_TYPES.MemberExpression;
  const name = nameOf(isMember ? callee.property : callee);
  if (name !== undefined && OPENERS.has(name)) {
    return true;
  }
  const opened = name === 'execute' && isMember;
  return opened && callChain(callee.object).steps.some((step) => step.name === TRANSACTION);
}

export function openerCallback(node: TSESTree.Node): OpenerFunction | undefined {
  for (const fn of ancestorsOf(node).filter(isFunctionNode)) {
    if (isOpenerFunction(fn)) {
      return fn;
    }
    if (!estreeRunsWithCaller(fn)) {
      return undefined;
    }
  }
  return undefined;
}

export function transactionCallback(node: TSESTree.Node): OpenerFunction | undefined {
  const fn = openerCallback(node);
  return fn !== undefined && fn.params.length > 0 ? fn : undefined;
}

export function clientOrigin(
  identifier: TSESTree.Identifier,
  { context, fn }: ClientScope,
): ClientOrigin {
  const pending = [identifier];
  for (const current of pending) {
    const definition = findVariable(context, current, current.name)?.defs[0];
    if (definition?.type === DefinitionType.Parameter) {
      return definition.node === fn ? TRANSACTION : 'parameter';
    }
    const init = definition?.type === DefinitionType.Variable ? definition.node.init : undefined;
    if (init === undefined || init === null || pending.length > MAX_DEPTH) {
      return OTHER;
    }
    const root = rootNode(init);
    if (root?.type !== AST_NODE_TYPES.Identifier) {
      return OTHER;
    }
    pending.push(root);
  }
  return OTHER;
}

export function mentionsTransaction(
  args: readonly TSESTree.Node[],
  context: Context,
  fn: FunctionNode,
): boolean {
  const pending = [...args];
  for (const node of pending) {
    if (
      node.type === AST_NODE_TYPES.Identifier &&
      clientOrigin(node, { context, fn }) === TRANSACTION
    ) {
      return true;
    }
    appendAll(pending, childrenOf(node, context.sourceCode.visitorKeys));
  }
  return false;
}
