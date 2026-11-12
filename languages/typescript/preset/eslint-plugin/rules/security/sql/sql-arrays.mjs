import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { depthFirst } from '../../../../../../../shared/traversal.mjs';
import { findVariable, isFunctionNode } from '../../analysis/constant-resolution.mjs';
import { memberName, resolvedValue, typeServices, unwrapped } from '../security-values.mjs';

const MAPPERS = new Set(['map', 'flatMap']);
const PRESERVING = new Set([
  'filter',
  'slice',
  'reverse',
  'sort',
  'toSorted',
  'toReversed',
  'flat',
]);
const ADDERS = new Map([
  ['push', 0],
  ['unshift', 0],
  ['splice', 2],
]);
const INDEX_CALLBACKS = new Set(['map', 'flatMap', 'forEach', 'filter', 'some', 'every', 'find']);
const NUMERIC_MAPPERS = new Set(['Number', 'parseInt', 'parseFloat', 'BigInt']);
const NUMERIC_FLAGS = ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.BooleanLike;

export function textOf(node) {
  return { kind: 'text', node };
}

export function arrayOf(node) {
  return { kind: 'array', node };
}

function isArrayFrom(call) {
  const callee = call.callee;
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Array' &&
    memberName(callee) === 'from'
  );
}

export function isIndexParameter(context, identifier) {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const fn = definition?.type === 'Parameter' ? definition.node : undefined;
  const call = fn?.parent;
  if (call?.type !== 'CallExpression' || call.callee.type !== 'MemberExpression') {
    return false;
  }
  const isCallback = isArrayFrom(call)
    ? call.arguments[1] === fn
    : INDEX_CALLBACKS.has(memberName(call.callee)) && call.arguments[0] === fn;
  return isCallback && fn.params[1] === definition.name;
}

function functionChildren(node) {
  return Object.entries(node)
    .filter(([key]) => key !== 'parent')
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((value) => typeof value?.type === 'string' && !isFunctionNode(value));
}

function callbackObligations(callback) {
  if (!isFunctionNode(callback)) {
    const numeric = callback?.type === 'Identifier' && NUMERIC_MAPPERS.has(callback.name);
    return numeric ? [] : undefined;
  }
  if (callback.body.type !== 'BlockStatement') {
    return [textOf(callback.body)];
  }
  const returns = [...depthFirst(callback.body, functionChildren)].filter(
    (node) => node.type === 'ReturnStatement',
  );
  const valued = returns.length > 0 && returns.every((node) => node.argument);
  return valued ? returns.map((node) => textOf(node.argument)) : undefined;
}

function hasNumericElements(context, node) {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(node);
  if (!checker.isArrayType(type) && !checker.isTupleType(type)) {
    return false;
  }
  const element = type.getNumberIndexType();
  const members = element?.isUnion() ? element.types : [element];
  return members.every((member) => member !== undefined && (member.flags & NUMERIC_FLAGS) !== 0);
}

function elementObligations(elements) {
  if (elements.some((element) => element === null)) {
    return undefined;
  }
  return elements.map((element) =>
    element.type === 'SpreadElement' ? arrayOf(element.argument) : textOf(element),
  );
}

function referenceObligations(reference) {
  if (reference.isWrite()) {
    return reference.init === true ? [] : [arrayOf(reference.writeExpr)];
  }
  const member = reference.identifier.parent;
  if (member?.type !== 'MemberExpression' || member.object !== reference.identifier) {
    return undefined;
  }
  const owner = member.parent;
  const name = memberName(member);
  if (owner?.type === 'CallExpression' && owner.callee === member && ADDERS.has(name)) {
    return elementObligations(owner.arguments.slice(ADDERS.get(name)));
  }
  if (owner?.type === 'AssignmentExpression' && owner.left === member) {
    return member.computed ? [textOf(owner.right)] : undefined;
  }
  return name === 'fill' ? undefined : [];
}

function localArrayObligations(context, identifier) {
  const variable = findVariable(context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  const declarator = definition?.type === 'Variable' ? definition.node : undefined;
  if (declarator?.id.type !== 'Identifier' || !declarator.init) {
    return undefined;
  }
  const parts = variable.references.map((reference) => referenceObligations(reference));
  return parts.includes(undefined) ? undefined : [arrayOf(declarator.init), ...parts.flat()];
}

function methodObligations(call) {
  const name = memberName(call.callee);
  const [first, second] = call.arguments;
  if (isArrayFrom(call)) {
    return second === undefined ? [arrayOf(first)] : callbackObligations(second);
  }
  if (MAPPERS.has(name)) {
    return callbackObligations(first);
  }
  if (name === 'fill') {
    return first === undefined ? undefined : [textOf(first)];
  }
  return PRESERVING.has(name) ? [arrayOf(call.callee.object)] : undefined;
}

export function arrayObligations(context, node) {
  const start = unwrapped(node);
  if (start === undefined || start === null) {
    return undefined;
  }
  if (hasNumericElements(context, start)) {
    return [];
  }
  if (start.type === 'Identifier') {
    return localArrayObligations(context, start);
  }
  const target = resolvedValue(context, start);
  if (target?.type === 'ArrayExpression') {
    return elementObligations(target.elements);
  }
  const isMethod = target?.type === 'CallExpression' && target.callee.type === 'MemberExpression';
  return isMethod ? methodObligations(target) : undefined;
}
