import ts from 'typescript';
import { depthFirst } from '../../../../../../../shared/traversal.mjs';
import { findVariable, isFunctionNode } from '../../analysis/constant-resolution.mjs';
import { memberName, resolvedValue, unwrapped } from '../security-values.mjs';

const MAX_DEPTH = 8;
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

function returnsInert(callback, isInert) {
  if (!isFunctionNode(callback)) {
    return callback?.type === 'Identifier' && NUMERIC_MAPPERS.has(callback.name);
  }
  if (callback.body.type !== 'BlockStatement') {
    return isInert(callback.body);
  }
  const returns = [...depthFirst(callback.body, functionChildren)].filter(
    (node) => node.type === 'ReturnStatement',
  );
  return returns.length > 0 && returns.every((node) => node.argument && isInert(node.argument));
}

function hasNumericElements(context, node) {
  const services = context.sourceCode.parserServices;
  if (services?.program === undefined || services.program === null) {
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

function elementsInert(context, elements, isInert, depth) {
  return elements.every(
    (element) =>
      element !== null &&
      (element.type === 'SpreadElement'
        ? inertArray(context, element.argument, isInert, depth + 1)
        : isInert(element)),
  );
}

function addedValuesInert(context, call, position, isInert, depth) {
  return elementsInert(context, call.arguments.slice(position), isInert, depth);
}

function referenceKeepsInert(context, reference, isInert, depth) {
  if (reference.isWrite()) {
    return reference.init === true || inertArray(context, reference.writeExpr, isInert, depth + 1);
  }
  const member = reference.identifier.parent;
  if (member?.type !== 'MemberExpression' || member.object !== reference.identifier) {
    return false;
  }
  const owner = member.parent;
  const call = owner?.type === 'CallExpression' && owner.callee === member ? owner : undefined;
  const name = memberName(member);
  if (call !== undefined && ADDERS.has(name)) {
    return addedValuesInert(context, call, ADDERS.get(name), isInert, depth);
  }
  const assigned = owner?.type === 'AssignmentExpression' && owner.left === member;
  return assigned ? member.computed && isInert(owner.right) : name !== 'fill';
}

function localArrayInert(context, identifier, isInert, depth) {
  const variable = findVariable(context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  const declarator = definition?.type === 'Variable' ? definition.node : undefined;
  if (declarator?.id.type !== 'Identifier' || !declarator.init) {
    return false;
  }
  return (
    inertArray(context, declarator.init, isInert, depth + 1) &&
    variable.references.every((reference) =>
      referenceKeepsInert(context, reference, isInert, depth),
    )
  );
}

function methodArrayInert(context, call, isInert, depth) {
  const name = memberName(call.callee);
  const [first] = call.arguments;
  if (isArrayFrom(call)) {
    return call.arguments.length > 1
      ? returnsInert(call.arguments[1], isInert)
      : inertArray(context, first, isInert, depth + 1);
  }
  if (MAPPERS.has(name)) {
    return returnsInert(first, isInert);
  }
  if (name === 'fill') {
    return first !== undefined && isInert(first);
  }
  if (name === 'concat') {
    return (
      inertArray(context, call.callee.object, isInert, depth + 1) &&
      call.arguments.every(
        (argument) => inertArray(context, argument, isInert, depth + 1) || isInert(argument),
      )
    );
  }
  return PRESERVING.has(name) && inertArray(context, call.callee.object, isInert, depth + 1);
}

export function inertArray(context, node, isInert, depth = 0) {
  const start = unwrapped(node);
  if (depth > MAX_DEPTH || start === undefined || start === null) {
    return false;
  }
  if (hasNumericElements(context, start)) {
    return true;
  }
  if (start.type === 'Identifier') {
    return localArrayInert(context, start, isInert, depth);
  }
  const target = resolvedValue(context, start);
  if (target?.type === 'ArrayExpression') {
    return elementsInert(context, target.elements, isInert, depth);
  }
  const isMethod = target?.type === 'CallExpression' && target.callee.type === 'MemberExpression';
  return isMethod && methodArrayInert(context, target, isInert, depth);
}
