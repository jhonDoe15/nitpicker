import { AST_NODE_TYPES, TSESLint, type JSONSchema, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../analysis/constant-resolution.mts';
import { callsWithin, heldScope } from '../effects/held-scopes.mts';
import { childrenOf } from '../loops/loop-shapes.mts';
import type { Context } from '../security/security-values.mts';
import { isEstreeConsumed } from '../support/flow/consumed.mts';
import { rootNode } from '../support/orm/chains.mts';
import { ormSite, type FoundSite } from '../support/orm/sites.mts';
import { ancestorsOf, nameOf, type VisitorKeys } from '../typed/node-views.mts';
import type { FunctionNode } from '../typed/syntax-views.mts';
import { openerCallback } from './clients.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

const { DefinitionType } = TSESLint.Scope;

export type OrmCall = { readonly call: TSESTree.CallExpression; readonly site: FoundSite };
export type WriteOptions = readonly [
  { readonly orms?: readonly string[]; readonly opensTransactions: boolean }?,
];

export const WRITE_OPTIONS_SCHEMA: JSONSchema.JSONSchema4[] = [
  {
    type: 'object',
    properties: {
      orms: { type: 'array', items: { type: 'string' } },
      opensTransactions: { type: 'boolean' },
    },
    additionalProperties: false,
  },
];

const TRANSACTION_NAMES =
  /^(?:tx|trx|txn|t|manager|em|runner|queryRunner|transaction|entityManager)$/u;
const BEGINNERS = new Set(['begin', 'beginTransaction', 'startTransaction']);
const TRANSACTIONAL_DECORATORS = new Set(['Transactional', 'Transaction']);

function mentionsTransactionName(
  args: readonly TSESTree.Node[],
  visitorKeys: VisitorKeys,
): boolean {
  const pending = [...args];
  for (const node of pending) {
    const named = node.type === AST_NODE_TYPES.Identifier && TRANSACTION_NAMES.test(node.name);
    const keyed =
      node.type === AST_NODE_TYPES.Property && TRANSACTION_NAMES.test(nameOf(node.key) ?? '');
    if (named || keyed) {
      return true;
    }
    appendAll(pending, childrenOf(node, visitorKeys));
  }
  return false;
}

function rootIsParameter(call: TSESTree.Node, context: Context): boolean {
  const root = rootNode(call);
  const definition =
    root?.type === AST_NODE_TYPES.Identifier
      ? findVariable(context, root, root.name)?.defs[0]
      : undefined;
  return definition?.type === DefinitionType.Parameter;
}

function inFallbackBlock(call: TSESTree.Node): boolean {
  return ancestorsOf(call).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.CatchClause ||
      (ancestor.type === AST_NODE_TYPES.TryStatement &&
        ancestor.finalizer !== null &&
        ancestor.finalizer.range[0] <= call.range[0]),
  );
}

function beginsTransaction(unit: FunctionNode, visitorKeys: VisitorKeys): boolean {
  return callsWithin(unit.body, visitorKeys).some((call) => {
    if (call.type !== AST_NODE_TYPES.CallExpression) {
      return false;
    }
    const name =
      call.callee.type === AST_NODE_TYPES.MemberExpression
        ? nameOf(call.callee.property)
        : undefined;
    return name !== undefined && BEGINNERS.has(name);
  });
}

function hasTransactionalDecorator(unit: FunctionNode): boolean {
  const { parent } = unit;
  const decorators = 'decorators' in parent ? parent.decorators : [];
  return decorators.some(({ expression }) => {
    const name = nameOf(
      expression.type === AST_NODE_TYPES.CallExpression ? expression.callee : expression,
    );
    return name !== undefined && TRANSACTIONAL_DECORATORS.has(name);
  });
}

export function isTransactionalUnit(unit: FunctionNode, visitorKeys: VisitorKeys): boolean {
  return hasTransactionalDecorator(unit) || beginsTransaction(unit, visitorKeys);
}

function isOutsideTransaction(call: TSESTree.Node, context: Context): boolean {
  return (
    openerCallback(call) === undefined && heldScope('transaction', call, context) === undefined
  );
}

export function unitWrites(
  body: TSESTree.Node,
  context: Context,
  orms: readonly string[],
): OrmCall[] {
  const { visitorKeys } = context.sourceCode;
  return callsWithin(body, visitorKeys)
    .filter(
      (call): call is TSESTree.CallExpression =>
        call.type === AST_NODE_TYPES.CallExpression && isEstreeConsumed(call),
    )
    .flatMap((call) => {
      const site = ormSite(call, 'write', orms);
      const free =
        site?.table !== undefined &&
        isOutsideTransaction(call, context) &&
        !inFallbackBlock(call) &&
        !rootIsParameter(call, context) &&
        !mentionsTransactionName(call.arguments, visitorKeys);
      return free ? [{ call, site }] : [];
    });
}
