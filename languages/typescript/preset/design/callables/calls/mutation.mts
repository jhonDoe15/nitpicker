import type TypeScript from 'typescript';
import { ts, nonEmptyChainOf as chainOf } from '../../syntax/typed.mts';
import type { Scope } from '../../design-types.mts';
import { isAccess, isValueWrapper, isWrite } from '../../syntax/nodes.mts';
import { symbolOf } from '../scope.mts';

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

function outermostWrapper(node: TypeScript.Node): TypeScript.Node {
  return chainOf(node, (current) =>
    isValueWrapper(current.parent, current) ? current.parent : undefined,
  ).at(-1);
}

function methodMutation(outer: TypeScript.Node): string | undefined {
  const access = outer.parent;
  if (!ts.isPropertyAccessExpression(access) || access.expression !== outer) {
    return undefined;
  }
  const call = access.parent;
  const isCall = ts.isCallExpression(call) && call.expression === access;
  return isCall && MUTATING_METHODS.has(access.name.text) ? access.name.text : undefined;
}

function assignmentMutation(outer: TypeScript.Node): string | undefined {
  const accessed = chainOf(outer, (current) =>
    isAccess(current.parent) && current.parent.expression === current ? current.parent : undefined,
  );
  return accessed.length > 1 && isWrite(accessed.at(-1)) ? 'assign' : undefined;
}

function mutationOfValue(node: TypeScript.Node): string | undefined {
  const outer = outermostWrapper(node);
  return methodMutation(outer) ?? assignmentMutation(outer);
}

function isReassigned(scope: Scope, symbol: TypeScript.Symbol): boolean {
  return scope.nodes.some(
    (node) =>
      ts.isIdentifier(node) &&
      node.text === symbol.name &&
      isWrite(node) &&
      symbolOf(scope, node) === symbol,
  );
}

function localMutation(
  scope: Scope,
  declaration: TypeScript.VariableDeclaration,
): string | undefined {
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

export function mutationOfCall(
  scope: Scope,
  call: TypeScript.CallExpression | TypeScript.PropertyAccessExpression,
): string | undefined {
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
