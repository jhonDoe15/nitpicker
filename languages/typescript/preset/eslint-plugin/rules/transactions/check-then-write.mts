import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { callsWithin, heldScope } from '../effects/held-scopes.mts';
import { childrenOf } from '../loops/loop-shapes.mts';
import { isEstreeConsumed } from '../support/flow/consumed.mts';
import type { Context } from '../security/security-values.mts';
import { stepIn } from '../support/orm/builders.mts';
import { ormSite } from '../support/orm/sites.mts';
import { ancestorsOf, contains, outermostWrapper, type VisitorKeys } from '../typed/node-views.mts';
import { openerCallback } from './clients.mts';
import { endsInExit } from './exclusive-branches.mts';
import type { OrmCall } from './writes-in-units.mts';

type Scope = { readonly body: TSESTree.Node; readonly context: Context };

const WRAPPERS = new Set<string>([
  'AwaitExpression',
  'ChainExpression',
  'TSNonNullExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
]);
const LOCKED = /lock|forUpdate|for update|forShare|pessimistic|skipLocked/iu;
const ATOMIC =
  /on\s*conflict|onDuplicate|orIgnore|orUpdate|upsert|findOrCreate|\bversion\b|revision|updatedAt/iu;
const AGGREGATES = new Set([
  'count',
  'countBy',
  'exist',
  'exists',
  'existsBy',
  'aggregate',
  'groupBy',
]);
const INSERTS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'bulkCreate',
  'insert',
  'insertInto',
  'insertMany',
  'nativeInsert',
  'persist',
  'persistAndFlush',
]);

export function unitReads(
  body: TSESTree.Node,
  context: Context,
  orms: readonly string[],
): OrmCall[] {
  const { sourceCode } = context;
  return callsWithin(body, sourceCode.visitorKeys)
    .filter(
      (call): call is TSESTree.CallExpression =>
        call.type === AST_NODE_TYPES.CallExpression && isEstreeConsumed(call),
    )
    .flatMap((call) => {
      const site = ormSite(call, 'read', orms);
      const plain =
        site?.table !== undefined &&
        openerCallback(call) === undefined &&
        heldScope('transaction', call, context) === undefined &&
        !LOCKED.test(sourceCode.getText(call));
      return plain ? [{ call, site }] : [];
    });
}

function isAtomicWrite(call: TSESTree.Node, context: Context): boolean {
  return ATOMIC.test(context.sourceCode.getText(call));
}

function readsName(node: TSESTree.Node, name: string, visitorKeys: VisitorKeys): boolean {
  const pending = [node];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.Identifier && current.name === name) {
      return true;
    }
    pending.push(...childrenOf(current, visitorKeys));
  }
  return false;
}

function boundName(call: TSESTree.Node): string | undefined {
  const holder = outermostWrapper(call, WRAPPERS).parent;
  return holder?.type === AST_NODE_TYPES.VariableDeclarator &&
    holder.id.type === AST_NODE_TYPES.Identifier
    ? holder.id.name
    : undefined;
}

function decidesWrite(read: OrmCall, write: OrmCall, visitorKeys: VisitorKeys): boolean {
  if (read.site.chain.steps.some((step) => stepIn(AGGREGATES, step))) {
    return true;
  }
  if (write.site.chain.steps.some((step) => stepIn(INSERTS, step))) {
    return true;
  }
  const name = boundName(read.call);
  const saves = write.site.chain.steps.at(-1)?.name === 'save';
  return (
    saves &&
    (name === undefined || !write.call.arguments.some((arg) => readsName(arg, name, visitorKeys)))
  );
}

function decidingConditions(
  read: OrmCall,
  { body, visitorKeys }: { readonly body: TSESTree.Node; readonly visitorKeys: VisitorKeys },
): TSESTree.IfStatement[] {
  const name = boundName(read.call);
  const direct = ancestorsOf(read.call).find(
    (node): node is TSESTree.IfStatement =>
      node.type === AST_NODE_TYPES.IfStatement && contains(node.test, read.call),
  );
  if (name === undefined) {
    return direct === undefined ? [] : [direct];
  }
  const found: TSESTree.IfStatement[] = [];
  const pending = [body];
  for (const node of pending) {
    if (
      node.type === AST_NODE_TYPES.IfStatement &&
      node.range[0] > read.call.range[1] &&
      readsName(node.test, name, visitorKeys)
    ) {
      found.push(node);
    }
    pending.push(...childrenOf(node, visitorKeys));
  }
  return found;
}

function governs(condition: TSESTree.IfStatement, write: OrmCall): boolean {
  const inside = [condition.consequent, condition.alternate].some(
    (branch) => branch !== null && contains(branch, write.call),
  );
  const guarded =
    endsInExit(condition.consequent) &&
    condition.alternate === null &&
    write.call.range[0] > condition.range[1] &&
    contains(condition.parent, write.call);
  return inside || guarded;
}

export function decidedWrite(
  read: OrmCall,
  writes: readonly OrmCall[],
  scope: Scope,
): OrmCall | undefined {
  const { visitorKeys } = scope.context.sourceCode;
  const conditions = decidingConditions(read, { body: scope.body, visitorKeys });
  return writes.find(
    (write) =>
      write.site.table === read.site.table &&
      decidesWrite(read, write, visitorKeys) &&
      write.call.range[0] > read.call.range[1] &&
      conditions.some((condition) => governs(condition, write)) &&
      !isAtomicWrite(write.call, scope.context),
  );
}
