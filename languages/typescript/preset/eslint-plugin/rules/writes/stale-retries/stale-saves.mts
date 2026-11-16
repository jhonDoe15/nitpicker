import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { ModuleScope } from '../../database/orm-modules.mts';
import { callsWithin } from '../../effects/held-scopes.mts';
import { isRepositoryLike, receiverNames } from '../../queries/query-calls.mts';
import { unwrapped, type Context } from '../../security/security-values.mts';
import { calleeOrigin, callEffects } from '../../support/io-effects.mts';
import { ancestorsOf, contains, nameOf, variableNamed } from '../../typed/node-views.mts';
import { isFunction } from '../../typed/syntax-views.mts';

export const CONFLICT = 'OptimisticLockVersionMismatchError';

const MODEL_NAME = /^[A-Z]/u;
const FIND = /^find/u;

const TRANSACTION_OPENERS = new Set(['transaction', 'transactional', 'runInTransaction']);
const REFRESHES = new Set(['reload', 'refresh']);

function openerName(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  return nameOf(callee.type === AST_NODE_TYPES.MemberExpression ? callee.property : callee);
}

function isOpenerCall(node: TSESTree.Node | undefined): boolean {
  if (node?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const name = openerName(node);
  return name !== undefined && TRANSACTION_OPENERS.has(name);
}

function isTransactionManager(receiver: TSESTree.Node): boolean {
  if (receiver.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  return ancestorsOf(receiver).some(
    (node) =>
      isFunction(node) && nameOf(node.params[0]) === receiver.name && isOpenerCall(node.parent),
  );
}

function isTypeormReceiver(
  call: TSESTree.CallExpression,
  callee: TSESTree.MemberExpression,
  context: Context,
): boolean {
  const { object: receiver } = callee;
  return (
    isRepositoryLike(receiverNames(receiver)) ||
    isTransactionManager(receiver) ||
    calleeOrigin(call, context)?.pkg === 'typeorm'
  );
}

export function isSave(
  call: TSESTree.CallExpression,
  context: Context,
  scope: ModuleScope,
): boolean {
  const callee = unwrapped(call.callee);
  return (
    scope.families.has('typeorm') &&
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.name === 'save' &&
    isTypeormReceiver(call, callee, context)
  );
}

function spreadIdentifier(argument: TSESTree.Node): TSESTree.Identifier | undefined {
  if (argument.type !== AST_NODE_TYPES.ObjectExpression) {
    return undefined;
  }
  const spread = argument.properties.find(
    (property): property is TSESTree.SpreadElement =>
      property.type === AST_NODE_TYPES.SpreadElement,
  );
  return spread?.argument.type === AST_NODE_TYPES.Identifier ? spread.argument : undefined;
}

function entityOf(call: TSESTree.CallExpression): TSESTree.Identifier | undefined {
  for (const argument of call.arguments.map((each) => unwrapped(each))) {
    if (argument.type === AST_NODE_TYPES.Identifier && !MODEL_NAME.test(argument.name)) {
      return argument;
    }
    const spread = spreadIdentifier(argument);
    if (spread !== undefined) {
      return spread;
    }
  }
  return undefined;
}

function writtenInside(variable: TSESLint.Scope.Variable, region: TSESTree.Node): boolean {
  return variable.references.some(
    (reference) => reference.isWrite() && !reference.init && contains(region, reference.identifier),
  );
}

function isRefresh(call: TSESTree.CallExpression | TSESTree.TaggedTemplateExpression): boolean {
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const name = nameOf(callee.property);
  return name !== undefined && REFRESHES.has(name);
}

function readsInside(context: Context, region: TSESTree.Node): boolean {
  return callsWithin(region, context.sourceCode.visitorKeys).some((call) => {
    const effects = callEffects(call, context);
    return isRefresh(call) || (effects.has('database') && !effects.has('write'));
  });
}

export function staleEntity(
  context: Context,
  call: TSESTree.CallExpression,
  region: TSESTree.Node,
): string | undefined {
  const entity = entityOf(call);
  const variable = entity === undefined ? undefined : variableNamed(context.sourceCode, entity);
  const declared = variable?.defs[0]?.name;
  if (variable === undefined || declared === undefined || contains(region, declared)) {
    return undefined;
  }
  const stale = !writtenInside(variable, region) && !readsInside(context, region);
  return stale ? entity?.name : undefined;
}

function isFreshRead(init: TSESTree.Node | null | undefined): boolean {
  const value = init === null || init === undefined ? undefined : unwrapped(init);
  const call = value?.type === AST_NODE_TYPES.AwaitExpression ? unwrapped(value.argument) : value;
  if (call?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = call;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression && FIND.test(nameOf(callee.property) ?? '')
  );
}

export function unchangedEntity(
  context: Context,
  call: TSESTree.CallExpression,
  region: TSESTree.Node,
): string | undefined {
  const argument = unwrapped(
    call.arguments.find((each) => each.type === AST_NODE_TYPES.Identifier) ?? call,
  );
  if (argument.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const variable = variableNamed(context.sourceCode, argument);
  const declarator = variable?.defs[0]?.node;
  if (
    variable === undefined ||
    declarator?.type !== AST_NODE_TYPES.VariableDeclarator ||
    !contains(region, declarator) ||
    !isFreshRead(declarator.init)
  ) {
    return undefined;
  }
  const others = variable.references.filter(
    (reference) => reference.identifier !== argument && reference.identifier !== declarator.id,
  );
  return others.length === 0 ? argument.name : undefined;
}
