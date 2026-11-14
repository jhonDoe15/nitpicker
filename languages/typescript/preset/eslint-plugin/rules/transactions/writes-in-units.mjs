import { heldScope, callsWithin } from '../effects/held-scopes.mjs';
import { isEstreeConsumed } from '../support/flow/estree-consumed.mjs';
import { childrenOf } from '../analysis/node/estree-children.mjs';
import { ancestorsOf } from '../analysis/ancestry.mjs';
import { findVariable } from '../analysis/constant-resolution.mjs';
import { rootNode } from '../support/orm/chains.mjs';
import { ormSite } from '../support/orm/sites.mjs';
import { openerCallback } from './clients.mjs';

const TRANSACTION_NAMES =
  /^(?:tx|trx|txn|t|manager|em|runner|queryRunner|transaction|entityManager)$/u;
const BEGINNERS = new Set(['begin', 'beginTransaction', 'startTransaction']);
const TRANSACTIONAL_DECORATORS = new Set(['Transactional', 'Transaction']);

function mentionsTransactionName(args, visitorKeys) {
  const pending = [...args];
  for (const node of pending) {
    const named = node.type === 'Identifier' && TRANSACTION_NAMES.test(node.name);
    const keyed = node.type === 'Property' && TRANSACTION_NAMES.test(node.key.name ?? '');
    if (named || keyed) {
      return true;
    }
    pending.push(...childrenOf(node, visitorKeys));
  }
  return false;
}

function rootIsParameter(call, context) {
  const root = rootNode(call);
  const definition =
    root?.type === 'Identifier' ? findVariable(context, root, root.name)?.defs[0] : undefined;
  return definition?.type === 'Parameter';
}

function inFallbackBlock(call) {
  return ancestorsOf(call).some(
    (ancestor) =>
      ancestor.type === 'CatchClause' ||
      (ancestor.type === 'TryStatement' &&
        ancestor.finalizer !== null &&
        ancestor.finalizer.range[0] <= call.range[0]),
  );
}

function beginsTransaction(unit, visitorKeys) {
  return callsWithin(unit.body, visitorKeys).some(
    (call) =>
      call.type === 'CallExpression' &&
      call.callee.type === 'MemberExpression' &&
      BEGINNERS.has(call.callee.property.name),
  );
}

export function isTransactionalUnit(unit, visitorKeys) {
  const decorators = unit.parent?.decorators ?? [];
  return (
    decorators.some((decorator) =>
      TRANSACTIONAL_DECORATORS.has(decorator.expression.callee?.name ?? decorator.expression.name),
    ) || beginsTransaction(unit, visitorKeys)
  );
}

function isOutsideTransaction(call, context) {
  return (
    openerCallback(call) === undefined && heldScope('transaction', call, context) === undefined
  );
}

export function unitWrites(body, context, orms) {
  const { visitorKeys } = context.sourceCode;
  return callsWithin(body, visitorKeys)
    .filter((call) => call.type === 'CallExpression' && isEstreeConsumed(call))
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
