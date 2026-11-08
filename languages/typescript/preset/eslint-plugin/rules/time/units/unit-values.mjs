import { constantNumber, findVariable } from '../../analysis/constant-resolution.mjs';
import { chainOf, foldTree } from '../../../../../../../shared/traversal.mjs';
import {
  convertedUnit,
  isEpochName,
  unitOfCallName,
  unitOfName,
} from '../../../../../../../shared/naming/time-units/unit-names.mjs';

const MAX_DEPTH = 8;
const WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ChainExpression',
]);
const CLAIMS = new Set(['exp', 'iat', 'nbf', 'auth_time']);
const CLAIMS_OWNER = /token|claim|payload|jwt|decode/iu;
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
const ARITHMETIC = new Set(['*', '/', '+', '-']);
const KEEPING_CALLS = new Set(['Math.max', 'Math.min']);

export function unwrap(node) {
  return chainOf(node, (link) => (WRAPPERS.has(link.type) ? link.expression : undefined)).at(-1);
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
  const links = chainOf(unwrap(callee), (link) =>
    propertyName(link) === undefined ? undefined : unwrap(link.object),
  );
  const names = links
    .map((link) => (link.type === 'Identifier' ? link.name : propertyName(link)))
    .filter((name) => name !== undefined);
  return names.length === 0 ? undefined : names.toReversed().join('.');
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

function named(name, unit) {
  return unit === undefined ? undefined : { unit, epoch: isEpochName(name) };
}

function memberUnit(node) {
  const name = propertyName(node);
  if (name === undefined) {
    return undefined;
  }
  if (CLAIMS.has(name) && CLAIMS_OWNER.test(calleeText(node.object) ?? '')) {
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

function passesUnit(text, last) {
  return (text.startsWith('Math.') && ROUNDING.has(last)) || NUMBER_WRAPPERS.has(text);
}

function clockUnit(text) {
  return [...CLOCK_CALLS].find(([call]) => text === call || text.endsWith(`.${call}`))?.[1];
}

function callOperands(node) {
  const text = calleeText(node.callee) ?? '';
  if (passesUnit(text, text.split('.').at(-1))) {
    return node.arguments.slice(0, 1);
  }
  return KEEPING_CALLS.has(text) ? node.arguments : [];
}

function callUnit(node, values) {
  const text = calleeText(node.callee) ?? '';
  const last = text.split('.').at(-1);
  if (EPOCH_CALLS.has(text)) {
    return { unit: EPOCH_CALLS.get(text), epoch: true };
  }
  const clock = clockUnit(text);
  if (clock !== undefined) {
    return { unit: clock, epoch: false };
  }
  if (last === 'getTime' && node.arguments.length === 0) {
    return { unit: 'ms', epoch: true };
  }
  if (passesUnit(text, last)) {
    return values[0];
  }
  if (KEEPING_CALLS.has(text)) {
    return sameUnit(values);
  }
  return last === undefined ? undefined : named(last, unitOfCallName(last));
}

function scaled(context, node, [left, right]) {
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

function additive(context, node, [left, right]) {
  if (isText(node.left) || isText(node.right) || mismatch(left, right)) {
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

export function isNarrowing(context, node) {
  return (
    node.type === 'BinaryExpression' &&
    NARROWING.has(node.operator) &&
    constantNumber(context, node.right) === 0
  );
}

function binaryOperands(context, node) {
  if (ARITHMETIC.has(node.operator)) {
    return [node.left, node.right];
  }
  return isNarrowing(context, node) ? [node.left] : [];
}

function binaryUnit(context, node, values) {
  if (node.operator === '*' || node.operator === '/') {
    const found = scaled(context, node, values);
    return found?.unit === undefined ? undefined : found;
  }
  if (node.operator === '+' || node.operator === '-') {
    return additive(context, node, values);
  }
  return values[0];
}

function identifierOperands(context, node) {
  if (unitOfName(node.name) !== undefined) {
    return [];
  }
  const init = constInitializer(context, node);
  return init === undefined || init === null ? [] : [init];
}

function operands(context, node, depth) {
  const target = unwrap(node);
  if (target === undefined || target === null || depth > MAX_DEPTH) {
    return [];
  }
  switch (target.type) {
    case 'Identifier':
      return identifierOperands(context, target);
    case 'CallExpression':
      return callOperands(target);
    case 'BinaryExpression':
      return binaryOperands(context, target);
    case 'ConditionalExpression':
      return [target.consequent, target.alternate];
    default:
      return [];
  }
}

function combined(context, node, values) {
  const target = unwrap(node);
  switch (target?.type) {
    case 'Identifier':
      return named(target.name, unitOfName(target.name)) ?? values[0];
    case 'MemberExpression':
      return memberUnit(target);
    case 'CallExpression':
      return callUnit(target, values);
    case 'BinaryExpression':
      return binaryUnit(context, target, values);
    case 'ConditionalExpression':
      return sameUnit(values);
    default:
      return undefined;
  }
}

export function valueUnit(context, node) {
  return foldTree(
    node,
    (current, depth) => operands(context, current, depth),
    (current, values) => combined(context, current, values),
  );
}
