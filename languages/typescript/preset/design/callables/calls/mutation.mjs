import ts from 'typescript';
import { chainOf } from '../../../../../../shared/traversal.mjs';
import { isAccess, isValueWrapper, isWrite } from '../../syntax/nodes.mjs';
import { symbolOf } from '../scope.mjs';

const MUTATING_METHODS = new Set([
  'push',
  'add',
  'put',
  'set',
  'delete',
  'remove',
  'clear',
  'sort',
  'splice',
  'append',
  'extend',
  'update',
  'pop',
  'shift',
  'unshift',
  'reverse',
  'fill',
  'copyWithin',
]);

function outermostWrapper(node) {
  return chainOf(node, (current) =>
    isValueWrapper(current.parent, current) ? current.parent : undefined,
  ).at(-1);
}

function methodMutation(outer) {
  const access = outer.parent;
  const isReceiver = ts.isPropertyAccessExpression(access) && access.expression === outer;
  const call = isReceiver ? access.parent : undefined;
  const isCall = call !== undefined && ts.isCallExpression(call) && call.expression === access;
  return isCall && MUTATING_METHODS.has(access.name.text) ? access.name.text : undefined;
}

function assignmentMutation(outer) {
  const accessed = chainOf(outer, (current) =>
    isAccess(current.parent) && current.parent.expression === current ? current.parent : undefined,
  );
  return accessed.length > 1 && isWrite(accessed.at(-1)) ? 'assign' : undefined;
}

function mutationOfValue(node) {
  const outer = outermostWrapper(node);
  return methodMutation(outer) ?? assignmentMutation(outer);
}

function isReassigned(scope, symbol) {
  return scope.nodes.some(
    (node) =>
      ts.isIdentifier(node) &&
      node.text === symbol.name &&
      isWrite(node) &&
      symbolOf(scope, node) === symbol,
  );
}

function localMutation(scope, declaration) {
  const symbol = scope.checker.getSymbolAtLocation(declaration.name);
  if (symbol === undefined || isReassigned(scope, symbol)) {
    return undefined;
  }
  const uses = scope.nodes.filter(
    (node) =>
      ts.isIdentifier(node) &&
      node.text === symbol.name &&
      node !== declaration.name &&
      symbolOf(scope, node) === symbol,
  );
  return uses.map(mutationOfValue).find((mutation) => mutation !== undefined);
}

export function mutationOfCall(scope, call) {
  const outer = outermostWrapper(call);
  const direct = mutationOfValue(call);
  if (direct !== undefined) {
    return direct;
  }
  const holder = outer.parent;
  const isLocal =
    ts.isVariableDeclaration(holder) &&
    holder.initializer === outer &&
    ts.isIdentifier(holder.name);
  return isLocal ? localMutation(scope, holder) : undefined;
}
