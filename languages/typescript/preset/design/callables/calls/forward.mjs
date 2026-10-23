import ts from 'typescript';
import { unwrap } from '../../syntax/nodes.mjs';
import { acceptsPosition, declaredParameters } from '../signature/params.mjs';
import { targetSite } from './targets.mjs';

function soleStatement(node) {
  if (!ts.isBlock(node.body)) {
    return { expression: node.body, returned: true };
  }
  const [only, ...rest] = node.body.statements;
  if (only === undefined || rest.length > 0) {
    return undefined;
  }
  if (ts.isReturnStatement(only) && only.expression !== undefined) {
    return { expression: only.expression, returned: true };
  }
  return ts.isExpressionStatement(only)
    ? { expression: only.expression, returned: false }
    : undefined;
}

function argumentIndex(scope, argument) {
  if (!ts.isIdentifier(argument)) {
    return -1;
  }
  const declaration = scope.checker.getSymbolAtLocation(argument)?.valueDeclaration;
  const index = declaredParameters(scope.site.node).indexOf(declaration);
  const isPlain = index !== -1 && ts.isIdentifier(declaration.name) && !declaration.dotDotDotToken;
  return isPlain ? index : -1;
}

function isAsync(node) {
  return (ts.getEffectiveModifierFlags(node) & ts.ModifierFlags.Async) !== 0;
}

function isThenable(scope, call) {
  return scope.checker.getTypeAtLocation(call).getProperty('then') !== undefined;
}

function forwardedCall(scope, expression) {
  const call = ts.isParenthesizedExpression(expression) ? unwrap(expression) : expression;
  const isPlainCall =
    ts.isCallExpression(call) &&
    !(call.flags & ts.NodeFlags.OptionalChain) &&
    !call.arguments.some(ts.isSpreadElement);
  return isPlainCall ? call : undefined;
}

export function forwardFact(scope) {
  const { site } = scope;
  const { node } = site;
  const sole = site.kind === 'method' || site.kind === 'function' ? soleStatement(node) : undefined;
  const call =
    sole === undefined || node.asteriskToken ? undefined : forwardedCall(scope, sole.expression);
  const target = call === undefined ? undefined : targetSite(scope, call);
  if (target === undefined || (isAsync(node) && !(sole.returned && isThenable(scope, call)))) {
    return undefined;
  }
  const passed = call.arguments.map((argument) => argumentIndex(scope, argument));
  const fits = call.arguments.every((_, position) => acceptsPosition(target, position));
  return fits && passed.some((index) => index !== -1)
    ? { target: target.id, arguments: passed, returned: sole.returned }
    : undefined;
}
