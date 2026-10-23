import ts from 'typescript';
import { chainOf } from '../../../../../shared/traversal.mjs';
import { unwrap } from './nodes.mjs';

const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef', 'React.memo', 'React.forwardRef']);

function isFunctionExpression(node) {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

export function isFunctionValue(node) {
  return node !== undefined && isFunctionExpression(unwrap(node));
}

function wrapped(current) {
  const isWrapperCall =
    ts.isCallExpression(current) && COMPONENT_WRAPPERS.has(current.expression.getText());
  return isWrapperCall && current.arguments[0] !== undefined
    ? unwrap(current.arguments[0])
    : undefined;
}

export function wrappedFunction(node) {
  if (node === undefined) {
    return undefined;
  }
  const last = chainOf(unwrap(node), wrapped).at(-1);
  return isFunctionExpression(last) ? last : undefined;
}
