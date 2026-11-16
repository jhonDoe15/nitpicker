import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

type Value = Exclude<TSESTree.Literal['value'], bigint | RegExp> | undefined;
type Folded = Value | typeof UNKNOWN;

const UNKNOWN = Symbol('unknown');
const MAX_DEPTH = 40;

const UNARY = new Map<string, (value: Value) => Value>([
  ['!', (value) => !truthy(value)],
  ['-', (value) => -Number(value)],
  ['+', (value) => Number(value)],
  ['~', (value) => ~Number(value)],
  ['typeof', (value) => typeof value],
]);

function truthy(value: Value): boolean {
  return Boolean(value);
}

function isNullish(value: unknown): boolean {
  return value === null || value === undefined;
}

function looselyEqual(left: Value, right: Value): Folded {
  if (isNullish(left) && isNullish(right)) {
    return true;
  }
  return typeof left === typeof right && !isNullish(left) ? left === right : UNKNOWN;
}

function negate(value: Folded): Folded {
  return value === UNKNOWN ? UNKNOWN : !truthy(value);
}

function bothStrings(left: Value, right: Value): left is string {
  return typeof left === 'string' && typeof right === 'string';
}

const BINARY = new Map<string, (left: Value, right: Value) => Folded>([
  ['==', looselyEqual],
  ['!=', (left, right) => negate(looselyEqual(left, right))],
  ['===', (left, right) => left === right],
  ['!==', (left, right) => left !== right],
  [
    '<',
    (left, right) =>
      bothStrings(left, right) ? left < String(right) : Number(left) < Number(right),
  ],
  [
    '<=',
    (left, right) =>
      bothStrings(left, right) ? left <= String(right) : Number(left) <= Number(right),
  ],
  [
    '>',
    (left, right) =>
      bothStrings(left, right) ? left > String(right) : Number(left) > Number(right),
  ],
  [
    '>=',
    (left, right) =>
      bothStrings(left, right) ? left >= String(right) : Number(left) >= Number(right),
  ],
  [
    '+',
    (left, right) =>
      typeof left === 'string' || typeof right === 'string'
        ? String(left) + String(right)
        : Number(left) + Number(right),
  ],
  ['-', (left, right) => Number(left) - Number(right)],
  ['*', (left, right) => Number(left) * Number(right)],
  ['/', (left, right) => Number(left) / Number(right)],
  ['%', (left, right) => Number(left) % Number(right)],
]);

const GLOBAL_VALUES = new Map<string, number | undefined>([
  ['undefined', undefined],
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
]);

function foldLogical(node: TSESTree.LogicalExpression, depth: number): Folded {
  const left = fold(node.left, depth);
  if (left === UNKNOWN) {
    return UNKNOWN;
  }
  const decided =
    (node.operator === '&&' && !truthy(left)) ||
    (node.operator === '||' && truthy(left)) ||
    (node.operator === '??' && left !== null && left !== undefined);
  return decided ? left : fold(node.right, depth);
}

function foldBinary(node: TSESTree.BinaryExpression, depth: number): Folded {
  const operation = BINARY.get(node.operator);
  const left = fold(node.left, depth);
  const right = fold(node.right, depth);
  return operation === undefined || left === UNKNOWN || right === UNKNOWN
    ? UNKNOWN
    : operation(left, right);
}

function foldUnary(node: TSESTree.UnaryExpression, depth: number): Folded {
  if (node.operator === 'void') {
    return undefined;
  }
  const operation = UNARY.get(node.operator);
  const value = fold(node.argument, depth);
  return operation === undefined || value === UNKNOWN ? UNKNOWN : operation(value);
}

function foldConditional(node: TSESTree.ConditionalExpression, depth: number): Folded {
  const test = fold(node.test, depth);
  if (test === UNKNOWN) {
    return UNKNOWN;
  }
  return fold(truthy(test) ? node.consequent : node.alternate, depth);
}

function foldLiteral(node: TSESTree.Literal): Folded {
  return 'regex' in node || 'bigint' in node ? UNKNOWN : node.value;
}

function foldIdentifier(node: TSESTree.Identifier): Folded {
  return GLOBAL_VALUES.has(node.name) ? GLOBAL_VALUES.get(node.name) : UNKNOWN;
}

function foldTemplate(node: TSESTree.TemplateLiteral): Folded {
  return node.expressions.length === 0 ? node.quasis[0]?.value.cooked : UNKNOWN;
}

const FOLDERS = new Map<string, (node: TSESTree.Node, depth: number) => Folded>([
  [
    AST_NODE_TYPES.Literal,
    (node) => (node.type === AST_NODE_TYPES.Literal ? foldLiteral(node) : UNKNOWN),
  ],
  [
    AST_NODE_TYPES.Identifier,
    (node) => (node.type === AST_NODE_TYPES.Identifier ? foldIdentifier(node) : UNKNOWN),
  ],
  [
    AST_NODE_TYPES.TemplateLiteral,
    (node) => (node.type === AST_NODE_TYPES.TemplateLiteral ? foldTemplate(node) : UNKNOWN),
  ],
  [
    AST_NODE_TYPES.UnaryExpression,
    (node, depth) =>
      node.type === AST_NODE_TYPES.UnaryExpression ? foldUnary(node, depth) : UNKNOWN,
  ],
  [
    AST_NODE_TYPES.BinaryExpression,
    (node, depth) =>
      node.type === AST_NODE_TYPES.BinaryExpression ? foldBinary(node, depth) : UNKNOWN,
  ],
  [
    AST_NODE_TYPES.LogicalExpression,
    (node, depth) =>
      node.type === AST_NODE_TYPES.LogicalExpression ? foldLogical(node, depth) : UNKNOWN,
  ],
  [
    AST_NODE_TYPES.ConditionalExpression,
    (node, depth) =>
      node.type === AST_NODE_TYPES.ConditionalExpression ? foldConditional(node, depth) : UNKNOWN,
  ],
]);

function fold(node: TSESTree.Node | undefined, depth = 0): Folded {
  const folder = node === undefined ? undefined : FOLDERS.get(node.type);
  if (node === undefined || folder === undefined || depth > MAX_DEPTH) {
    return UNKNOWN;
  }
  return folder(node, depth + 1);
}

export function isLiteralCondition(node: TSESTree.Node | undefined): boolean {
  return fold(node) !== UNKNOWN;
}
