import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { isCombinator, isPromiseStep } from './estree-consumed.mjs';

function tsOuter(call) {
  const chain = [call];
  for (const node of chain) {
    const { parent } = node;
    if (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent)) {
      chain.push(parent);
    }
  }
  return chain.at(-1);
}

function isTsCollected(node) {
  const { parent } = node;
  const host = ts.isArrayLiteralExpression(parent) ? parent.parent : parent;
  if (!(ts.isCallExpression(host) && ts.isPropertyAccessExpression(host.expression))) {
    return false;
  }
  const { name, expression } = host.expression;
  const combined =
    isCombinator(name.text) && ts.isIdentifier(expression) && expression.text === 'Promise';
  return name.text === 'push' || combined;
}

export function isTsConsumed(call) {
  const node = tsOuter(call);
  const { parent } = node;
  const sink =
    ts.isAwaitExpression(parent) ||
    ts.isReturnStatement(parent) ||
    ts.isYieldExpression(parent) ||
    (ts.isArrowFunction(parent) && parent.body === node);
  if (sink) {
    return true;
  }
  const stepped =
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node &&
    isPromiseStep(parent.name.text);
  return stepped || isTsCollected(node);
}
