import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../../rules/analysis/constant-resolution.mts';
import { ancestorsOf, nameOf } from '../../rules/typed/node-views.mts';
import { isCallLike } from '../unowned-async/node-facts/node-facts.mts';
import { propertyName } from '../unowned-async/nodes.mts';

export type Construct = {
  readonly node: TSESTree.Node;
  readonly name: string;
  readonly collection: TSESTree.Node | undefined;
};
type LoopNode =
  | TSESTree.ForStatement
  | TSESTree.ForInStatement
  | TSESTree.ForOfStatement
  | TSESTree.WhileStatement;

const LOOP_NAMES = new Map<string, string>([
  ['ForStatement', 'for'],
  ['ForInStatement', 'for...in'],
  ['ForOfStatement', 'for...of'],
  ['WhileStatement', 'while'],
]);
const COMPARISONS = new Map<string, (left: number, right: number) => boolean>([
  ['<', (left, right) => left < right],
  ['<=', (left, right) => left <= right],
  ['>', (left, right) => left > right],
  ['>=', (left, right) => left >= right],
  ['!=', (left, right) => left !== right],
  ['!==', (left, right) => left !== right],
]);
const ITERATING_METHODS = new Set([
  'forEach',
  'map',
  'flatMap',
  'filter',
  'some',
  'every',
  'reduce',
  'reduceRight',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
]);
const ARRAY_FROM_MAPPER = 1;

function isArrayFrom(callee: TSESTree.Node): boolean {
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    propertyName(callee) === 'from' &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Array'
  );
}

function isPositiveNumber(node: TSESTree.Node | undefined): boolean {
  return node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'number' && node.value > 0;
}

function isFixedLength(spec: TSESTree.Node | undefined): boolean {
  return (
    spec?.type === AST_NODE_TYPES.ObjectExpression &&
    spec.properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.Property &&
        nameOf(property.key) === 'length' &&
        isPositiveNumber(property.value),
    )
  );
}

function isFixedLengthArray(node: TSESTree.Node | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    isArrayFrom(node.callee) &&
    isFixedLength(node.arguments[0])
  );
}

function iterationOf(
  call: TSESTree.CallExpression,
  argument: TSESTree.Node,
): Construct | undefined {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const name = propertyName(callee);
  if (isArrayFrom(callee)) {
    const [spec] = call.arguments;
    const isMapper = call.arguments.findIndex((each) => each === argument) === ARRAY_FROM_MAPPER;
    return isMapper && !isFixedLength(spec)
      ? { node: call, name: 'Array.from', collection: spec }
      : undefined;
  }
  if (
    name !== undefined &&
    ITERATING_METHODS.has(name) &&
    call.arguments.some((each) => each === argument)
  ) {
    return isFixedLengthArray(callee.object)
      ? undefined
      : { node: call, name, collection: callee.object };
  }
  return undefined;
}

function startsRunning(node: TSESTree.ForStatement): boolean {
  const [declaration] =
    node.init?.type === AST_NODE_TYPES.VariableDeclaration ? node.init.declarations : [];
  const { test } = node;
  const binary = test?.type === AST_NODE_TYPES.BinaryExpression ? test : undefined;
  const compare = COMPARISONS.get(binary?.operator ?? '');
  const start = declaration?.init;
  return (
    compare !== undefined &&
    binary !== undefined &&
    declaration !== undefined &&
    nameOf(declaration.id) === nameOf(binary.left) &&
    start?.type === AST_NODE_TYPES.Literal &&
    typeof start.value === 'number' &&
    binary.right.type === AST_NODE_TYPES.Literal &&
    typeof binary.right.value === 'number' &&
    compare(start.value, binary.right.value)
  );
}

function isLoop(node: TSESTree.Node): node is LoopNode {
  return LOOP_NAMES.has(node.type);
}

function runsOnce(node: LoopNode, child: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.ForStatement) {
    return node.init === child;
  }
  return node.type !== AST_NODE_TYPES.WhileStatement && node.right === child;
}

function loopOf(node: TSESTree.Node, child: TSESTree.Node): Construct | undefined {
  const name = LOOP_NAMES.get(node.type);
  if (name === undefined || !isLoop(node) || runsOnce(node, child)) {
    return undefined;
  }
  const collection =
    node.type === AST_NODE_TYPES.ForOfStatement || node.type === AST_NODE_TYPES.ForInStatement
      ? node.right
      : undefined;
  if (
    isFixedLengthArray(collection) ||
    (node.type === AST_NODE_TYPES.ForStatement && startsRunning(node))
  ) {
    return undefined;
  }
  const awaited = node.type === AST_NODE_TYPES.ForOfStatement && node.await;
  return { node, name: awaited ? 'for await...of' : name, collection };
}

function constructAt(node: TSESTree.Node, child: TSESTree.Node): Construct | undefined {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return iterationOf(node, child);
  }
  return loopOf(node, child);
}

export function isInline(fn: TSESTree.Node): boolean {
  const { parent } = fn;
  return (
    parent !== undefined &&
    isCallLike(parent) &&
    (parent.arguments.some((argument) => argument === fn) || parent.callee === fn)
  );
}

export function isIterationArgument(node: TSESTree.Node): boolean {
  return (
    node.parent?.type === AST_NODE_TYPES.CallExpression &&
    iterationOf(node.parent, node) !== undefined
  );
}

export function loopsAround(site: TSESTree.Node, test: TSESTree.Node): Construct[] {
  const path = [site, ...ancestorsOf(site)];
  const inside = path.slice(0, path.indexOf(test));
  const stop = inside.findIndex((node) => isFunctionNode(node) && !isInline(node));
  const reach = stop < 0 ? inside : inside.slice(0, stop);
  return reach
    .map((node, index) => constructAt(inside[index + 1] ?? test, node))
    .filter((construct) => construct !== undefined);
}
