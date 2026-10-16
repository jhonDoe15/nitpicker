import ts from 'typescript';
import { depthFirst, objectChildren } from '../../../../../../../shared/traversal.mjs';
import { stringValue } from '../../analysis/constant-resolution.mjs';
import { leafValues, memberName, unwrapped } from '../security-values.mjs';

const NUMERIC_FUNCTIONS = new Set(['Number', 'parseInt', 'parseFloat', 'BigInt', 'Boolean']);
const ESCAPE_FUNCTIONS = new Set(['escape', 'escapeId', 'escapeLiteral', 'escapeIdentifier']);
const NUMERIC_PROPERTIES = new Set(['length', 'size', 'byteLength']);
const PLACEHOLDER = /^[?$:@]\w*$/u;
const PLACEHOLDER_BUILDERS = new Set(['join', 'repeat']);
const INERT_LITERAL = /^[\w. ]*$/u;
const PRIMITIVE_FLAGS =
  ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike;
const DYNAMIC = '\u0000';

const STATEMENT =
  '(?:SELECT\\b[\\s\\S]*?\\bFROM\\b|INSERT\\s+INTO\\b|UPDATE\\s+\\S+\\s+SET\\b|DELETE\\s+FROM\\b|REPLACE\\s+INTO\\b|MERGE\\s+INTO\\b|TRUNCATE\\s+TABLE\\b|DROP\\s+(?:TABLE|INDEX|VIEW|DATABASE|SCHEMA)\\b|ALTER\\s+TABLE\\b|CREATE\\s+(?:UNIQUE\\s+)?(?:TABLE|INDEX|VIEW|DATABASE|SCHEMA)\\b|WITH\\s+\\S+\\s+AS\\s*\\()';
const STRONG_STATEMENT = new RegExp(`^\\s*${STATEMENT}`, 'u');
const LOOSE_STATEMENT = new RegExp(`^\\s*${STATEMENT}`, 'iu');
const FRAGMENT_BEFORE_VALUE =
  /(?:\b(?:where|and|or|having|on)\s+[\w."`[\]]+\s*(?:=|<>|!=|<=|>=|<|>|\blike\b|\bin\b|\bnot\s+in\b)\s*(?:\(\s*)?['"%]*|\b(?:order|group)\s+by\s+|\b(?:limit|offset)\s+)$/iu;

function literalText(leaf) {
  const text = stringValue(leaf);
  if (text !== undefined) {
    return text;
  }
  const isPrimitive =
    leaf.type === 'Literal' && ['number', 'boolean', 'bigint'].includes(typeof leaf.value);
  return isPrimitive ? String(leaf.value) : undefined;
}

function isPlaceholderChain(node) {
  const isBuilder =
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    PLACEHOLDER_BUILDERS.has(memberName(node.callee));
  return (
    isBuilder &&
    [...depthFirst(node, objectChildren)].some((child) => {
      const text =
        child.type === 'TemplateLiteral'
          ? child.quasis.map((quasi) => quasi.value.cooked).join('')
          : stringValue(child);
      return text !== undefined && PLACEHOLDER.test(text);
    })
  );
}

function isInertCall(node) {
  const callee = node.callee;
  if (callee.type === 'Identifier') {
    return NUMERIC_FUNCTIONS.has(callee.name);
  }
  const name = callee.type === 'MemberExpression' ? memberName(callee) : undefined;
  const onMath = callee.object?.type === 'Identifier' && callee.object.name === 'Math';
  return onMath || ESCAPE_FUNCTIONS.has(name) || ['getTime', 'now', 'toFixed'].includes(name);
}

function isInertShape(node) {
  const target = unwrapped(node);
  switch (target.type) {
    case 'UnaryExpression':
      return ['+', '-', '!', 'typeof'].includes(target.operator);
    case 'BinaryExpression':
      return target.operator !== '+';
    case 'MemberExpression':
      return NUMERIC_PROPERTIES.has(memberName(target));
    case 'CallExpression':
      return isInertCall(target) || isPlaceholderChain(target);
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

export function classify(context, node) {
  const leaves = leafValues(context, node);
  const texts = leaves.map((leaf) => literalText(leaf));
  if (texts.length > 0 && texts.every((text) => text !== undefined)) {
    return { text: texts[0] };
  }
  const services = hasTypes(context);
  const inert =
    leaves.every((leaf) => literalText(leaf) !== undefined || isInertShape(leaf)) ||
    (services !== undefined && isInertType(services, node));
  return inert ? { text: DYNAMIC } : { node };
}

function isPlus(node) {
  return node.type === 'BinaryExpression' && node.operator === '+';
}

function plusOperands(node) {
  return isPlus(node) ? [node.left, node.right] : [];
}

function templatePieces(context, node) {
  return node.quasis.flatMap((quasi, index) => {
    const text = { text: quasi.value.cooked ?? '' };
    const value = node.expressions[index];
    return value === undefined ? [text] : [text, classify(context, value)];
  });
}

function concatPieces(context, node) {
  const leaves = [...depthFirst(node, plusOperands)].filter((leaf) => !isPlus(leaf));
  const hasText = leaves.some(
    (leaf) => stringValue(leaf) !== undefined || leaf.type === 'TemplateLiteral',
  );
  return hasText ? leaves.map((leaf) => classify(context, leaf)) : undefined;
}

function methodPieces(context, node, isFormatCall) {
  const callee = node.callee;
  const name = callee.type === 'MemberExpression' ? memberName(callee) : undefined;
  if (isFormatCall(node)) {
    return node.arguments.map((part) => classify(context, part));
  }
  if (name === 'concat') {
    return [callee.object, ...node.arguments].map((part) => classify(context, part));
  }
  if (name === 'join' && unwrapped(callee.object).type === 'ArrayExpression') {
    return unwrapped(callee.object).elements.map((part) => classify(context, part));
  }
  if (['replace', 'replaceAll'].includes(name) && node.arguments.length === 2) {
    return [callee.object, node.arguments[1]].map((part) => classify(context, part));
  }
  return undefined;
}

export function compositionKind(node) {
  const kinds = {
    TemplateLiteral: 'a template literal',
    BinaryExpression: 'concatenation',
    AssignmentExpression: 'concatenation',
  };
  return kinds[node.type] ?? 'a string method';
}

export function piecesOf(context, node, isFormatCall) {
  if (node.type === 'TemplateLiteral') {
    return node.expressions.length === 0 ? undefined : templatePieces(context, node);
  }
  if (isPlus(node)) {
    return concatPieces(context, node);
  }
  return node.type === 'CallExpression' ? methodPieces(context, node, isFormatCall) : undefined;
}

export function hasRuntimeValue(pieces) {
  return pieces?.some((piece) => piece.node !== undefined) === true;
}

function fragmentBeforeValue(pieces) {
  const prefix = [];
  for (const piece of pieces) {
    if (piece.node !== undefined && FRAGMENT_BEFORE_VALUE.test(prefix.join(''))) {
      return true;
    }
    prefix.push(piece.text ?? DYNAMIC);
  }
  return false;
}

export function looksLikeSql(pieces, inSqlCall) {
  const text = pieces.map((piece) => piece.text ?? DYNAMIC).join('');
  return (
    STRONG_STATEMENT.test(text) ||
    fragmentBeforeValue(pieces) ||
    (inSqlCall && LOOSE_STATEMENT.test(text))
  );
}
