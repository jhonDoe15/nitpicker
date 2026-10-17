import ts from 'typescript';
import { stringValue } from '../../analysis/constant-resolution.mjs';
import { leafValues, memberName, unwrapped } from '../security-values.mjs';
import { inertArray, isIndexParameter } from './sql-arrays.mjs';

const MAX_DEPTH = 8;
const NUMERIC_FUNCTIONS = new Set(['Number', 'parseInt', 'parseFloat', 'BigInt', 'Boolean']);
const ESCAPE_FUNCTIONS = new Set(['escape', 'escapeId', 'escapeLiteral', 'escapeIdentifier']);
const NUMERIC_METHODS = new Set(['getTime', 'now', 'toFixed']);
const NUMERIC_PROPERTIES = new Set(['length', 'size', 'byteLength']);
const TEXT_BUILDERS = new Set([
  'repeat',
  'slice',
  'substring',
  'padStart',
  'padEnd',
  'trimEnd',
  'trimStart',
]);
const INERT_LITERAL = /^[\w. ]*$/u;
const PRIMITIVE_FLAGS =
  ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike;

export const DYNAMIC = '\u0000';

export function literalText(leaf) {
  const text = stringValue(leaf);
  if (text !== undefined) {
    return text;
  }
  const isPrimitive =
    leaf.type === 'Literal' && ['number', 'boolean', 'bigint'].includes(typeof leaf.value);
  return isPrimitive ? String(leaf.value) : undefined;
}

function isInertCall(node) {
  const callee = node.callee;
  if (callee.type === 'Identifier') {
    return NUMERIC_FUNCTIONS.has(callee.name);
  }
  const name = callee.type === 'MemberExpression' ? memberName(callee) : undefined;
  const onMath = callee.object?.type === 'Identifier' && callee.object.name === 'Math';
  return onMath || ESCAPE_FUNCTIONS.has(name) || NUMERIC_METHODS.has(name);
}

function inertTextCall(context, call, isInert) {
  const callee = call.callee;
  const name = callee.type === 'MemberExpression' ? memberName(callee) : undefined;
  if (name === 'join') {
    return inertArray(context, callee.object, isInert) && call.arguments.every(isInert);
  }
  return TEXT_BUILDERS.has(name) && isInert(callee.object);
}

function isInertShape(context, node, depth) {
  const target = unwrapped(node);
  const isInert = (part) => classify(context, part, depth + 1).node === undefined;
  switch (target.type) {
    case 'UnaryExpression':
      return ['+', '-', '!', 'typeof'].includes(target.operator);
    case 'BinaryExpression':
      return target.operator !== '+' || (isInert(target.left) && isInert(target.right));
    case 'MemberExpression':
      return NUMERIC_PROPERTIES.has(memberName(target));
    case 'TemplateLiteral':
      return target.expressions.every(isInert);
    case 'Identifier':
      return isIndexParameter(context, target);
    case 'CallExpression':
      return isInertCall(target) || inertTextCall(context, target, isInert);
    default:
      return false;
  }
}

function isInertType(services, node) {
  const type = services.getTypeAtLocation(node);
  const members = type.isUnion() ? type.types : [type];
  return members.every(
    (member) =>
      (member.flags & PRIMITIVE_FLAGS) !== 0 ||
      (member.isStringLiteral() && INERT_LITERAL.test(member.value)),
  );
}

function hasTypes(context) {
  const services = context.sourceCode.parserServices;
  return services?.program === undefined || services.program === null ? undefined : services;
}

export function classify(context, node, depth = 0) {
  if (depth > MAX_DEPTH) {
    return { node };
  }
  const leaves = leafValues(context, node);
  const texts = leaves.map((leaf) => literalText(leaf));
  if (texts.length > 0 && texts.every((text) => text !== undefined)) {
    return { text: texts[0] };
  }
  const services = hasTypes(context);
  const inert =
    leaves.every((leaf) => literalText(leaf) !== undefined || isInertShape(context, leaf, depth)) ||
    (services !== undefined && isInertType(services, node));
  return inert ? { text: DYNAMIC } : { node };
}
