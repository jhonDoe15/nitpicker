import type { CallExpression, Expression, Node } from 'typescript';
import { ts } from '../../syntax/typed.mts';
import { unwrap } from '../../syntax/nodes.mts';
import { acceptsPosition, declaredParameters } from '../signature/params.mts';
import { targetSite } from './targets.mts';
import type { Fact, Scope, SiteNode } from '../../design-types.mts';

function soleStatement(node: SiteNode) {
  if (!('body' in node) || node.body === undefined) {
    return undefined;
  }
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

function argumentIndex(scope: Scope, argument: Expression): number {
  if (!ts.isIdentifier(argument)) {
    return -1;
  }
  const declaration = scope.checker.getSymbolAtLocation(argument)?.valueDeclaration;
  const parameters = declaredParameters(scope.site.node);
  const parameter = parameters.find((candidate) => candidate === declaration);
  const index = parameter === undefined ? -1 : parameters.indexOf(parameter);
  const isPlain =
    parameter !== undefined && ts.isIdentifier(parameter.name) && !parameter.dotDotDotToken;
  return isPlain ? index : -1;
}

function isAsync(node: Node): boolean {
  return (ts.getEffectiveModifierFlags(node) & ts.ModifierFlags.Async) !== 0;
}

function isThenable(scope: Scope, call: Expression): boolean {
  return scope.checker.getTypeAtLocation(call).getProperty('then') !== undefined;
}

function forwardedCall(expression: Expression): CallExpression | undefined {
  const call = ts.isParenthesizedExpression(expression) ? unwrap(expression) : expression;
  const isPlainCall =
    ts.isCallExpression(call) &&
    !(call.flags & ts.NodeFlags.OptionalChain) &&
    !call.arguments.some(ts.isSpreadElement);
  return isPlainCall ? call : undefined;
}

export function forwardFact(scope: Scope): Fact | undefined {
  const { site } = scope;
  const { node } = site;
  const sole = site.kind === 'method' || site.kind === 'function' ? soleStatement(node) : undefined;
  const isGenerator = 'asteriskToken' in node && node.asteriskToken !== undefined;
  const call = sole === undefined || isGenerator ? undefined : forwardedCall(sole.expression);
  const target = call === undefined ? undefined : targetSite(scope, call);
  if (
    sole === undefined ||
    call === undefined ||
    target === undefined ||
    (isAsync(node) && !(sole.returned && isThenable(scope, call)))
  ) {
    return undefined;
  }
  const passed = call.arguments.map((argument) => argumentIndex(scope, argument));
  const fits = call.arguments.every((_, position) => acceptsPosition(target, position));
  return fits && passed.some((index) => index !== -1)
    ? { target: target.id, arguments: passed, returned: sole.returned }
    : undefined;
}
