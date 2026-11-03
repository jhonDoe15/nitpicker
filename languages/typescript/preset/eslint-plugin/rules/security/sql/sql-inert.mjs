import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { DYNAMIC } from '../../../../../../../shared/rules/security/sql-text.mjs';
import { ancestorsOf, chainOf } from '../../analysis/ancestry.mjs';
import { findVariable, stringValue } from '../../analysis/constant-resolution.mjs';
import {
  leafValues,
  memberName,
  resolvedValue,
  typeServices,
  unwrapped,
} from '../security-values.mjs';
import { arrayObligations, arrayOf, isIndexParameter, textOf } from './sql-arrays.mjs';

const MAX_OBLIGATIONS = 256;
const NUMERIC_FUNCTIONS = new Set(['Number', 'parseInt', 'parseFloat', 'BigInt', 'Boolean']);
const ESCAPE_FUNCTIONS = new Set(['escape', 'escapeId', 'escapeLiteral', 'escapeIdentifier']);
const NUMERIC_METHODS = new Set(['getTime', 'now', 'toFixed']);
const NUMERIC_PROPERTIES = new Set(['length', 'size', 'byteLength']);
const INERT_UNARY = new Set(['+', '-', '!', 'typeof']);
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
const MEMBERSHIP = new Set(['has', 'includes']);
const EXITS = new Set(['ThrowStatement', 'ReturnStatement', 'ContinueStatement', 'BreakStatement']);
const PRIMITIVE_FLAGS =
  ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike;

function literalText(leaf) {
  const text = stringValue(leaf);
  if (text !== undefined) {
    return text;
  }
  const isPrimitive =
    leaf.type === 'Literal' && ['number', 'boolean', 'bigint'].includes(typeof leaf.value);
  return isPrimitive ? String(leaf.value) : undefined;
}

function isSetCall(value) {
  return (
    value?.type === 'NewExpression' &&
    value.callee.type === 'Identifier' &&
    value.callee.name === 'Set'
  );
}

function resolvedList(context, node) {
  return unwrapped(resolvedValue(context, node) ?? node);
}

function constantList(context, node) {
  const chain = chainOf(resolvedList(context, node), (value) =>
    isSetCall(value) ? resolvedList(context, value.arguments[0]) : undefined,
  );
  return chain.at(-1);
}

function isConstantCollection(context, node) {
  const list = constantList(context, node);
  return (
    list?.type === 'ArrayExpression' &&
    list.elements.length > 0 &&
    list.elements.every((element) => element !== null && literalText(element) !== undefined)
  );
}

function checks(context, test, variable) {
  const call = unwrapped(test);
  if (call?.type !== 'CallExpression') {
    return false;
  }
  const argument = unwrapped(call.arguments[0]);
  return (
    call.callee.type === 'MemberExpression' &&
    MEMBERSHIP.has(memberName(call.callee)) &&
    argument?.type === 'Identifier' &&
    findVariable(context, argument, argument.name) === variable &&
    isConstantCollection(context, call.callee.object)
  );
}

function exits(statement) {
  const last = chainOf(statement, (current) =>
    current.type === 'BlockStatement' ? current.body.at(-1) : undefined,
  ).at(-1);
  return EXITS.has(last?.type);
}

function isStopGuard(context, statement, variable) {
  const test = statement.type === 'IfStatement' ? unwrapped(statement.test) : undefined;
  return (
    test?.type === 'UnaryExpression' &&
    test.operator === '!' &&
    exits(statement.consequent) &&
    checks(context, test.argument, variable)
  );
}

function guards(context, { parent, child, variable }) {
  if (parent.type === 'IfStatement' && parent.consequent === child) {
    return checks(context, parent.test, variable);
  }
  const body = Array.isArray(parent.body) ? parent.body : undefined;
  const earlier = body?.slice(0, body.indexOf(child)) ?? [];
  return earlier.some((statement) => isStopGuard(context, statement, variable));
}

function isGuarded(context, identifier) {
  const variable = findVariable(context, identifier, identifier.name);
  if (variable === undefined || variable === null) {
    return false;
  }
  const chain = [identifier, ...ancestorsOf(identifier)];
  return chain
    .slice(1)
    .some((parent, index) => guards(context, { parent, child: chain[index], variable }));
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

function callObligations(call) {
  if (isInertCall(call)) {
    return [];
  }
  const callee = call.callee;
  const name = callee.type === 'MemberExpression' ? memberName(callee) : undefined;
  if (name === 'join') {
    return [arrayOf(callee.object), ...call.arguments.map((argument) => textOf(argument))];
  }
  return TEXT_BUILDERS.has(name) ? [textOf(callee.object)] : undefined;
}

function shapeObligations(context, leaf) {
  const target = unwrapped(leaf);
  switch (target.type) {
    case 'UnaryExpression':
      return INERT_UNARY.has(target.operator) ? [] : undefined;
    case 'BinaryExpression':
      return target.operator === '+' ? [textOf(target.left), textOf(target.right)] : [];
    case 'MemberExpression':
      return NUMERIC_PROPERTIES.has(memberName(target)) ? [] : undefined;
    case 'TemplateLiteral':
      return target.expressions.map((expression) => textOf(expression));
    case 'Identifier':
      return isIndexParameter(context, target) || isGuarded(context, target) ? [] : undefined;
    case 'CallExpression':
      return callObligations(target);
    default:
      return undefined;
  }
}

function isInertType(context, node) {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const type = services.getTypeAtLocation(node);
  const members = type.isUnion() ? type.types : [type];
  return members.every(
    (member) =>
      (member.flags & PRIMITIVE_FLAGS) !== 0 ||
      (member.isStringLiteral() && INERT_LITERAL.test(member.value)),
  );
}

function textObligations(context, node) {
  if (isInertType(context, node)) {
    return [];
  }
  const parts = leafValues(context, node).map((leaf) =>
    literalText(leaf) === undefined ? shapeObligations(context, leaf) : [],
  );
  return parts.includes(undefined) ? undefined : parts.flat();
}

const STEPS = { text: textObligations, array: arrayObligations };

function isInert(context, root) {
  const pending = [root];
  const seen = { text: new Set(), array: new Set() };
  for (const { kind, node } of pending) {
    const next =
      node === undefined || node === null || pending.length > MAX_OBLIGATIONS
        ? undefined
        : STEPS[kind](context, node);
    if (next === undefined) {
      return false;
    }
    seen[kind].add(node);
    pending.push(...next.filter((item) => !seen[item.kind].has(item.node)));
  }
  return true;
}

export function classify(context, node) {
  const texts = leafValues(context, node).map((leaf) => literalText(leaf));
  if (texts.length > 0 && texts.every((text) => text !== undefined)) {
    return { text: texts[0] };
  }
  return isInert(context, textOf(node)) ? { text: DYNAMIC } : { node };
}
