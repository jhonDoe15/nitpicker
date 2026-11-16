import { ancestorsOf, contains, variableNamed } from '../../analysis/ancestry.mjs';
import { callsWithin } from '../../effects/held-scopes.mts';
import { isRepositoryLike, receiverNames } from '../../queries/query-calls.mts';
import { unwrapped } from '../../security/security-values.mts';
import { calleeOrigin, callEffects } from '../../support/io-effects.mts';

export const CONFLICT = 'OptimisticLockVersionMismatchError';

const MODEL_NAME = /^[A-Z]/u;
const FIND = /^find/u;

const TRANSACTION_OPENERS = new Set(['transaction', 'transactional', 'runInTransaction']);
const REFRESHES = new Set(['reload', 'refresh']);

function openerName(call) {
  const { callee } = call;
  return callee.type === 'MemberExpression' ? callee.property.name : callee.name;
}

function isTransactionManager(receiver) {
  if (receiver.type !== 'Identifier') {
    return false;
  }
  return ancestorsOf(receiver).some(
    (node) =>
      /Function/u.test(node.type) &&
      node.params[0]?.name === receiver.name &&
      node.parent?.type === 'CallExpression' &&
      TRANSACTION_OPENERS.has(openerName(node.parent)),
  );
}

function isTypeormReceiver(call, context) {
  const receiver = unwrapped(call.callee).object;
  return (
    isRepositoryLike(receiverNames(receiver)) ||
    isTransactionManager(receiver) ||
    calleeOrigin(call, context)?.pkg === 'typeorm'
  );
}

export function isSave(call, context, scope) {
  const callee = unwrapped(call.callee);
  return (
    scope.families.has('typeorm') &&
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.name === 'save' &&
    isTypeormReceiver(call, context)
  );
}

function entityOf(call) {
  for (const argument of call.arguments.map(unwrapped)) {
    if (argument.type === 'Identifier' && !MODEL_NAME.test(argument.name)) {
      return argument;
    }
    const spread =
      argument.type === 'ObjectExpression'
        ? argument.properties.find((property) => property.type === 'SpreadElement')
        : undefined;
    if (spread?.argument.type === 'Identifier') {
      return spread.argument;
    }
  }
  return undefined;
}

function writtenInside(variable, region) {
  return variable.references.some(
    (reference) => reference.isWrite() && !reference.init && contains(region, reference.identifier),
  );
}

function isRefresh(call) {
  const { callee } = call;
  return callee.type === 'MemberExpression' && REFRESHES.has(callee.property.name);
}

function readsInside(context, region) {
  return callsWithin(region, context.sourceCode.visitorKeys).some((call) => {
    const effects = callEffects(call, context);
    return isRefresh(call) || (effects.has('database') && !effects.has('write'));
  });
}

export function staleEntity(context, call, region) {
  const entity = entityOf(call);
  const variable = entity === undefined ? undefined : variableNamed(context.sourceCode, entity);
  const declared = variable?.defs[0]?.name;
  const outside = declared !== undefined && !contains(region, declared);
  const stale = outside && !writtenInside(variable, region) && !readsInside(context, region);
  return stale ? entity.name : undefined;
}

function isFreshRead(init) {
  const value = init === null || init === undefined ? undefined : unwrapped(init);
  const call = value?.type === 'AwaitExpression' ? unwrapped(value.argument) : value;
  return (
    call?.type === 'CallExpression' &&
    call.callee.type === 'MemberExpression' &&
    FIND.test(call.callee.property.name ?? '')
  );
}

export function unchangedEntity(context, call, region) {
  const argument = unwrapped(call.arguments.find((each) => each.type === 'Identifier') ?? call);
  const variable =
    argument.type === 'Identifier' ? variableNamed(context.sourceCode, argument) : undefined;
  const declarator = variable?.defs[0]?.node;
  const fresh =
    declarator?.type === 'VariableDeclarator' &&
    contains(region, declarator) &&
    isFreshRead(declarator.init);
  const others = fresh
    ? variable.references.filter(
        (reference) => reference.identifier !== argument && reference.identifier !== declarator.id,
      )
    : [];
  return fresh && others.length === 0 ? argument.name : undefined;
}
