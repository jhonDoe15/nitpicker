import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { contains, type VisitorKeys } from '../typed/node-views.mts';
import { isFunction } from '../typed/syntax-views.mts';
import {
  descendants,
  isIdentifierAssignment,
  type IdentifierAssignment,
  type LoopNode,
  type TestedLoop,
} from './loop-shapes.mts';

type Binding = {
  readonly target: TSESTree.Node;
  readonly value: TSESTree.Node | undefined;
  readonly assigned: boolean;
};

const ARITHMETIC_OPERATORS = new Set(['+', '-', '*', '/', '%', '**']);

function isArithmeticSelfUpdate({ operator, left, right }: IdentifierAssignment): boolean {
  if (operator !== '=') {
    return ARITHMETIC_OPERATORS.has(operator.slice(0, -1));
  }
  return (
    right.type === AST_NODE_TYPES.BinaryExpression &&
    ARITHMETIC_OPERATORS.has(right.operator) &&
    [right.left, right.right].some(
      (side) => side.type === AST_NODE_TYPES.Identifier && side.name === left.name,
    )
  );
}

function isOpenLoop(loop: TestedLoop): boolean {
  const { test } = loop;
  return test === null || (test.type === AST_NODE_TYPES.Literal && test.value === true);
}

function isUnit(node: TSESTree.Node): boolean {
  const value = node.type === AST_NODE_TYPES.UnaryExpression ? node.argument : node;
  return value.type === AST_NODE_TYPES.Literal && value.value === 1;
}

function isCounterStep({ operator, left, right }: IdentifierAssignment): boolean {
  if (operator !== '=') {
    return isUnit(right);
  }
  if (right.type !== AST_NODE_TYPES.BinaryExpression) {
    return false;
  }
  const step =
    right.left.type === AST_NODE_TYPES.Identifier && right.left.name === left.name
      ? right.right
      : right.left;
  return isUnit(step);
}

function steppedNames(loop: LoopNode, visitorKeys: VisitorKeys): Set<string> {
  const update = 'update' in loop ? loop.update : undefined;
  const roots: TSESTree.Node[] =
    update === null || update === undefined ? [loop.body] : [loop.body, update];
  return new Set(
    roots
      .flatMap((root) => descendants(root, visitorKeys, isFunction))
      .filter(isIdentifierAssignment)
      .filter((node) => isArithmeticSelfUpdate(node) && !isCounterStep(node))
      .map((node) => node.left.name),
  );
}

function isCountingLoop(
  loop: LoopNode | undefined,
): loop is TSESTree.ForOfStatement | TSESTree.ForInStatement | undefined {
  return (
    loop === undefined ||
    loop.type === AST_NODE_TYPES.ForOfStatement ||
    loop.type === AST_NODE_TYPES.ForInStatement
  );
}

function isPagingLoop(loop: TestedLoop, visitorKeys: VisitorKeys): boolean {
  if (loop.test === null || isOpenLoop(loop)) {
    return true;
  }
  const tested = new Set(
    descendants(loop.test, visitorKeys, isFunction)
      .filter((node) => node.type === AST_NODE_TYPES.Identifier)
      .map(({ name }) => name),
  );
  return descendants(loop.body, visitorKeys, isFunction).some(
    (node) =>
      isIdentifierAssignment(node) && tested.has(node.left.name) && !isArithmeticSelfUpdate(node),
  );
}

function isReference(node: TSESTree.Node): node is TSESTree.Identifier {
  const { parent } = node;
  const isProperty =
    (parent?.type === AST_NODE_TYPES.MemberExpression &&
      parent.property === node &&
      !parent.computed) ||
    (parent?.type === AST_NODE_TYPES.Property && parent.key === node && !parent.shorthand);
  return node.type === AST_NODE_TYPES.Identifier && !isProperty;
}

function namesIn(node: TSESTree.Node, visitorKeys: VisitorKeys): Set<string> {
  return new Set(
    descendants(node, visitorKeys, isFunction)
      .filter(isReference)
      .map(({ name }) => name),
  );
}

function bindingOf(node: TSESTree.Node): Binding | undefined {
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return { target: node.left, value: node.right, assigned: true };
  }
  return node.type === AST_NODE_TYPES.VariableDeclarator
    ? { target: node.id, value: node.init ?? undefined, assigned: false }
    : undefined;
}

function loopAssignments(loop: LoopNode, visitorKeys: VisitorKeys): Map<string, boolean> {
  const nodes = descendants(loop.body, visitorKeys, isFunction);
  const varying = new Map<string, boolean>();
  for (const node of nodes) {
    const binding = bindingOf(node);
    if (
      binding !== undefined &&
      binding.target.type === AST_NODE_TYPES.Identifier &&
      binding.value !== undefined
    ) {
      const { name } = binding.target;
      const sources = [...namesIn(binding.value, visitorKeys)].filter((each) => each !== name);
      const carried = binding.assigned && sources.length > 0;
      varying.set(name, carried || sources.some((each) => varying.get(each) === true));
    }
  }
  return varying;
}

function isPolling(call: TSESTree.Node, loop: TestedLoop): boolean {
  return loop.test !== null && contains(loop.test, call);
}

export function isPagingCall(
  call: TSESTree.CallExpression | TSESTree.TaggedTemplateExpression,
  loop: LoopNode | undefined,
  visitorKeys: VisitorKeys,
): boolean {
  if (isCountingLoop(loop)) {
    return false;
  }
  const inputs = (call.type === AST_NODE_TYPES.CallExpression ? call.arguments : []).flatMap(
    (argument) => [...namesIn(argument, visitorKeys)],
  );
  const stepped = steppedNames(loop, visitorKeys);
  if (isPolling(call, loop) || inputs.some((name) => stepped.has(name))) {
    return true;
  }
  if (!isPagingLoop(loop, visitorKeys)) {
    return false;
  }
  const varying = loopAssignments(loop, visitorKeys);
  const changing = inputs.filter((name) => varying.has(name));
  const carried = changing.some((name) => varying.get(name));
  return isOpenLoop(loop) ? carried : changing.length === 0 || carried;
}
