import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { scopeChain } from './ancestry.mjs';

const MAX_RESOLVE_DEPTH = 8;

export function isFunctionNode(node) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'FunctionDeclaration'
  );
}

export function stringValue(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked ?? undefined;
  }
  return undefined;
}

export function findVariable(context, node, name) {
  for (const scope of scopeChain(context.sourceCode.getScope(node))) {
    const variable = scope.set.get(name);
    if (variable) return variable;
  }
  return undefined;
}

function constantInitializer(context, node, depth) {
  if (node?.type !== 'Identifier' || depth > MAX_RESOLVE_DEPTH) return undefined;
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === 'Variable' &&
    definition.parent.kind === 'const' &&
    definition.node.id.type === 'Identifier'
    ? definition.node.init
    : undefined;
}

export function resolveConstant(context, node, depth = 0) {
  let current = node;
  for (const currentDepth of Array.from(
    { length: Math.max(0, MAX_RESOLVE_DEPTH - depth + 1) },
    (_, index) => depth + index,
  )) {
    const next = constantInitializer(context, current, currentDepth);
    if (!next) return current;
    current = next;
  }
  return current;
}

export function resolveFunction(context, node) {
  if (node?.type !== 'Identifier') return undefined;
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (definition?.type === 'FunctionName') return definition.node;
  if (definition?.type === 'Variable' && definition.parent.kind === 'const') {
    const init = definition.node.init;
    return isFunctionNode(init) ? init : undefined;
  }
  return undefined;
}

const NUMBER_OPERATORS = {
  '*': (left, right) => left * right,
  '+': (left, right) => left + right,
  '-': (left, right) => left - right,
  '/': (left, right) => left / right,
};

function numericChildren(frame, context) {
  if (frame.depth > MAX_RESOLVE_DEPTH) return [];
  frame.resolved = resolveConstant(context, frame.node);
  const node = frame.resolved;
  let children = [];
  if (node?.type === 'UnaryExpression' && ['-', '+'].includes(node.operator))
    children = [node.argument];
  if (node?.type === 'BinaryExpression' && Object.hasOwn(NUMBER_OPERATORS, node.operator))
    children = [node.left, node.right];
  frame.children = children.map((child) => ({ node: child, depth: frame.depth + 1 }));
  return frame.children;
}

function numericValue(frame, values) {
  const node = frame.resolved;
  if (node?.type === 'Literal' && typeof node.value === 'number') return node.value;
  const operands = frame.children?.map((child) => values.get(child)) ?? [];
  if (operands.length === 0 || operands.some((value) => value === undefined)) return undefined;
  if (node.type === 'UnaryExpression') return node.operator === '-' ? -operands[0] : operands[0];
  return NUMBER_OPERATORS[node.operator](...operands);
}

export function constantNumber(context, node, depth = 0) {
  const root = { node, depth };
  const frames = [...depthFirst(root, (frame) => numericChildren(frame, context))];
  const values = new Map();
  for (const frame of frames.toReversed()) values.set(frame, numericValue(frame, values));
  return values.get(root);
}
