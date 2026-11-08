import { findVariable } from '../../analysis/constant-resolution.mjs';
import {
  convertedUnit,
  isEpochName,
  unitOfCallName,
  unitOfName,
} from '../../../../../../../shared/naming/time-units/unit-names.mjs';

const MAX_DEPTH = 4;
const WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ChainExpression',
]);
const CLAIMS = new Set(['exp', 'iat', 'nbf', 'auth_time']);
const ROUNDING = new Set(['floor', 'round', 'ceil', 'trunc', 'abs']);
const NUMBER_WRAPPERS = new Set(['Number', 'parseInt', 'parseFloat', 'BigInt']);
const EPOCH_CALLS = new Map([
  ['Date.now', 'ms'],
  ['Date.parse', 'ms'],
  ['Date.UTC', 'ms'],
]);
const CLOCK_CALLS = new Map([
  ['performance.now', 'ms'],
  ['process.uptime', 's'],
  ['hrtime.bigint', 'ns'],
]);
const NARROWING = new Set(['|', '>>', '<<', '>>>', '^']);

export function unwrap(node) {
  return WRAPPERS.has(node?.type) ? unwrap(node.expression) : node;
}

export function propertyName(node) {
  if (node?.type !== 'MemberExpression') {
    return undefined;
  }
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  return node.property.type === 'Literal' && typeof node.property.value === 'string'
    ? node.property.value
    : undefined;
}

export function calleeText(callee) {
  const target = unwrap(callee);
  if (target?.type === 'Identifier') {
    return target.name;
  }
  const name = propertyName(target);
  if (name === undefined) {
    return undefined;
  }
  const owner = calleeText(target.object);
  return owner === undefined ? name : `${owner}.${name}`;
}

function constInitializer(context, node) {
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === 'Variable' &&
    definition.parent.kind === 'const' &&
    definition.node.id.type === 'Identifier'
    ? definition.node.init
    : undefined;
}

export function constantNumber(context, node, depth = 0) {
  const target = unwrap(node);
  if (target?.type === 'Literal' && typeof target.value === 'number') {
    return target.value;
  }
  if (depth > MAX_DEPTH) {
    return undefined;
  }
  if (target?.type === 'BinaryExpression' && target.operator === '*') {
    const left = constantNumber(context, target.left, depth + 1);
    const right = constantNumber(context, target.right, depth + 1);
    return left === undefined || right === undefined ? undefined : left * right;
  }
  if (target?.type === 'Identifier' && unitOfName(target.name) === undefined) {
    const init = constInitializer(context, target);
    return init === undefined || init === null
      ? undefined
      : constantNumber(context, init, depth + 1);
  }
  return undefined;
}

function named(name, unit) {
  return unit === undefined ? undefined : { unit, epoch: isEpochName(name) };
}

function identifierUnit(context, node, depth) {
  const own = named(node.name, unitOfName(node.name));
  if (own !== undefined || depth > MAX_DEPTH) {
    return own;
  }
  const init = constInitializer(context, node);
  return init === undefined || init === null ? undefined : valueUnit(context, init, depth + 1);
}

function memberUnit(node) {
  const name = propertyName(node);
  if (name === undefined) {
    return undefined;
  }
  if (CLAIMS.has(name)) {
    return { unit: 's', epoch: true };
  }
  return named(name, unitOfName(name));
}

function sameUnit(units) {
  const known = units.filter((found) => found !== undefined);
  const [first] = known;
  return first !== undefined && known.every((found) => found.unit === first.unit)
    ? first
    : undefined;
}

function callUnit(context, node, depth) {
  const text = calleeText(node.callee) ?? '';
  const last = text.split('.').at(-1);
  if (EPOCH_CALLS.has(text)) {
    return { unit: EPOCH_CALLS.get(text), epoch: true };
  }
  const clock = CLOCK_CALLS.get(text) ?? CLOCK_CALLS.get(text.split('.').slice(-2).join('.'));
  if (clock !== undefined) {
    return { unit: clock, epoch: false };
  }
  if (last === 'getTime' && node.arguments.length === 0) {
    return { unit: 'ms', epoch: true };
  }
  const passes = (text.startsWith('Math.') && ROUNDING.has(last)) || NUMBER_WRAPPERS.has(text);
  if (passes && node.arguments.length > 0) {
    return valueUnit(context, node.arguments[0], depth + 1);
  }
  if (text === 'Math.max' || text === 'Math.min') {
    return sameUnit(node.arguments.map((argument) => valueUnit(context, argument, depth + 1)));
  }
  return last === undefined ? undefined : named(last, unitOfCallName(last));
}

function scaled(context, node, depth) {
  const left = valueUnit(context, node.left, depth + 1);
  const right = valueUnit(context, node.right, depth + 1);
  const leftFactor = constantNumber(context, node.left);
  const rightFactor = constantNumber(context, node.right);
  if (left !== undefined && right === undefined && rightFactor !== undefined) {
    return { unit: convertedUnit(left.unit, rightFactor, node.operator), epoch: left.epoch };
  }
  if (
    node.operator === '*' &&
    right !== undefined &&
    left === undefined &&
    leftFactor !== undefined
  ) {
    return { unit: convertedUnit(right.unit, leftFactor, '*'), epoch: right.epoch };
  }
  return undefined;
}

export function mismatch(left, right) {
  return left !== undefined && right !== undefined && left.unit !== right.unit;
}

function isText(node) {
  const target = unwrap(node);
  return (
    target.type === 'TemplateLiteral' ||
    (target.type === 'Literal' && typeof target.value === 'string')
  );
}

function additive(context, node, depth) {
  if (isText(node.left) || isText(node.right)) {
    return undefined;
  }
  const left = valueUnit(context, node.left, depth + 1);
  const right = valueUnit(context, node.right, depth + 1);
  if (mismatch(left, right)) {
    return undefined;
  }
  const unit = (left ?? right)?.unit;
  if (unit === undefined) {
    return undefined;
  }
  const epoch =
    node.operator === '-'
      ? left?.epoch === true && constantNumber(context, node.right) !== undefined
      : left?.epoch === true || right?.epoch === true;
  return { unit, epoch };
}

function binaryUnit(context, node, depth) {
  if (node.operator === '*' || node.operator === '/') {
    const found = scaled(context, node, depth);
    return found?.unit === undefined ? undefined : found;
  }
  if (node.operator === '+' || node.operator === '-') {
    return additive(context, node, depth);
  }
  return NARROWING.has(node.operator) && constantNumber(context, node.right) === 0
    ? valueUnit(context, node.left, depth + 1)
    : undefined;
}

export function valueUnit(context, node, depth = 0) {
  const target = unwrap(node);
  if (target === undefined || target === null || depth > MAX_DEPTH * 2) {
    return undefined;
  }
  switch (target.type) {
    case 'Identifier':
      return identifierUnit(context, target, depth);
    case 'MemberExpression':
      return memberUnit(target);
    case 'CallExpression':
      return callUnit(context, target, depth);
    case 'BinaryExpression':
      return binaryUnit(context, target, depth);
    case 'ConditionalExpression':
      return sameUnit([
        valueUnit(context, target.consequent, depth + 1),
        valueUnit(context, target.alternate, depth + 1),
      ]);
    default:
      return undefined;
  }
}

export function isNarrowing(context, node) {
  return (
    node.type === 'BinaryExpression' &&
    NARROWING.has(node.operator) &&
    constantNumber(context, node.right) === 0
  );
}
