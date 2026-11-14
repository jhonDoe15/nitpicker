import { ancestorsOf, contains, outermostWrapper } from '../analysis/ancestry.mjs';
import { callsWithin, heldScope } from '../effects/held-scopes.mjs';
import { childrenOf } from '../analysis/node/estree-children.mjs';
import { isEstreeConsumed } from '../support/flow/estree-consumed.mjs';
import { ormSite } from '../support/orm/sites.mjs';
import { openerCallback } from './clients.mjs';
import { endsInExit } from './exclusive-branches.mjs';

const WRAPPERS = new Set([
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

export function unitReads(body, context, orms) {
  const { sourceCode } = context;
  return callsWithin(body, sourceCode.visitorKeys)
    .filter((call) => call.type === 'CallExpression' && isEstreeConsumed(call))
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

function isAtomicWrite(call, context) {
  return ATOMIC.test(context.sourceCode.getText(call));
}

function readsName(node, name, visitorKeys) {
  const pending = [node];
  for (const current of pending) {
    if (current.type === 'Identifier' && current.name === name) {
      return true;
    }
    pending.push(...childrenOf(current, visitorKeys));
  }
  return false;
}

function boundName(call) {
  const holder = outermostWrapper(call, WRAPPERS).parent;
  const named = holder.type === 'VariableDeclarator' && holder.id.type === 'Identifier';
  return named ? holder.id.name : undefined;
}

function stepNames(entry) {
  return entry.site.chain.steps.map((step) => step.name);
}

function decidesWrite(read, write, visitorKeys) {
  if (stepNames(read).some((name) => AGGREGATES.has(name))) {
    return true;
  }
  if (stepNames(write).some((name) => INSERTS.has(name))) {
    return true;
  }
  const name = boundName(read.call);
  const saves = stepNames(write).at(-1) === 'save';
  return (
    saves &&
    (name === undefined || !write.call.arguments.some((arg) => readsName(arg, name, visitorKeys)))
  );
}

function decidingConditions(read, { body, visitorKeys }) {
  const name = boundName(read.call);
  const direct = ancestorsOf(read.call).find(
    (node) => node.type === 'IfStatement' && contains(node.test, read.call),
  );
  if (name === undefined) {
    return direct === undefined ? [] : [direct];
  }
  const found = [];
  const pending = [body];
  for (const node of pending) {
    const later = node.type === 'IfStatement' && node.range[0] > read.call.range[1];
    if (later && readsName(node.test, name, visitorKeys)) {
      found.push(node);
    }
    pending.push(...childrenOf(node, visitorKeys));
  }
  return found;
}

function governs(condition, write) {
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

export function decidedWrite(read, writes, scope) {
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
