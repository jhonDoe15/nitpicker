const UNKNOWN = Symbol('unknown');
const MAX_DEPTH = 40;

const UNARY = new Map([
  ['!', (value) => !value],
  ['-', (value) => -value],
  ['+', (value) => +value],
  ['~', (value) => ~value],
  ['typeof', (value) => typeof value],
]);

function isNullish(value) {
  return value === null || value === undefined;
}

function looselyEqual(left, right) {
  if (isNullish(left) && isNullish(right)) {
    return true;
  }
  return typeof left === typeof right && !isNullish(left) ? left === right : UNKNOWN;
}

function negate(value) {
  return value === UNKNOWN ? UNKNOWN : !value;
}

const BINARY = new Map([
  ['==', looselyEqual],
  ['!=', (left, right) => negate(looselyEqual(left, right))],
  ['===', (left, right) => left === right],
  ['!==', (left, right) => left !== right],
  ['<', (left, right) => left < right],
  ['<=', (left, right) => left <= right],
  ['>', (left, right) => left > right],
  ['>=', (left, right) => left >= right],
  ['+', (left, right) => left + right],
  ['-', (left, right) => left - right],
  ['*', (left, right) => left * right],
  ['/', (left, right) => left / right],
  ['%', (left, right) => left % right],
]);

const GLOBAL_VALUES = new Map([
  ['undefined', undefined],
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
]);

function foldLogical(node, depth) {
  const left = fold(node.left, depth);
  if (left === UNKNOWN) {
    return UNKNOWN;
  }
  const decided =
    (node.operator === '&&' && !left) ||
    (node.operator === '||' && left) ||
    (node.operator === '??' && left !== null && left !== undefined);
  return decided ? left : fold(node.right, depth);
}

function foldBinary(node, depth) {
  const operation = BINARY.get(node.operator);
  const left = fold(node.left, depth);
  const right = fold(node.right, depth);
  return operation === undefined || left === UNKNOWN || right === UNKNOWN
    ? UNKNOWN
    : operation(left, right);
}

function foldUnary(node, depth) {
  if (node.operator === 'void') {
    return undefined;
  }
  const operation = UNARY.get(node.operator);
  const value = fold(node.argument, depth);
  return operation === undefined || value === UNKNOWN ? UNKNOWN : operation(value);
}

function foldConditional(node, depth) {
  const test = fold(node.test, depth);
  if (test === UNKNOWN) {
    return UNKNOWN;
  }
  return fold(test ? node.consequent : node.alternate, depth);
}

function foldLiteral(node) {
  return node.regex === undefined && node.bigint === undefined ? node.value : UNKNOWN;
}

function foldIdentifier(node) {
  return GLOBAL_VALUES.has(node.name) ? GLOBAL_VALUES.get(node.name) : UNKNOWN;
}

function foldTemplate(node) {
  return node.expressions.length === 0 ? node.quasis[0].value.cooked : UNKNOWN;
}

const FOLDERS = new Map([
  ['Literal', foldLiteral],
  ['Identifier', foldIdentifier],
  ['TemplateLiteral', foldTemplate],
  ['UnaryExpression', foldUnary],
  ['BinaryExpression', foldBinary],
  ['LogicalExpression', foldLogical],
  ['ConditionalExpression', foldConditional],
]);

function fold(node, depth = 0) {
  const folder = FOLDERS.get(node?.type);
  if (folder === undefined || depth > MAX_DEPTH) {
    return UNKNOWN;
  }
  return folder(node, depth + 1);
}

export function isLiteralCondition(node) {
  return fold(node) !== UNKNOWN;
}
