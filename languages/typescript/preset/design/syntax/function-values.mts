import type { ArrowFunction, FunctionExpression, Node } from 'typescript';
import { ts, chainOf } from './typed.mts';
import { unwrap } from './nodes.mts';

type FunctionNode = ArrowFunction | FunctionExpression;

const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef', 'React.memo', 'React.forwardRef']);

function isFunctionExpression(node: Node): node is FunctionNode {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

export function isFunctionValue(node: Node | undefined): boolean {
  return node !== undefined && isFunctionExpression(unwrap(node));
}

function wrapped(current: Node) {
  const isWrapperCall =
    ts.isCallExpression(current) && COMPONENT_WRAPPERS.has(current.expression.getText());
  return isWrapperCall && current.arguments[0] !== undefined
    ? unwrap(current.arguments[0])
    : undefined;
}

export function wrappedFunction(node: Node | undefined): FunctionNode | undefined {
  if (node === undefined) {
    return undefined;
  }
  const last = chainOf(unwrap(node), wrapped).at(-1);
  return last !== undefined && isFunctionExpression(last) ? last : undefined;
}
