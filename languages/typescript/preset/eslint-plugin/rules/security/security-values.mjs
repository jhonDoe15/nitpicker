import { chainOf } from '../analysis/ancestry.mjs';
import { findVariable, resolveConstant, stringValue } from '../analysis/constant-resolution.mjs';
import { declaredMemberValue } from './member-values.mjs';

const MAX_DEPTH = 8;
export const DEPTHS = Array.from({ length: MAX_DEPTH }, (_, index) => index);
const TYPE_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ChainExpression',
]);
const TEXT_PRESERVING_METHODS = new Set(['toLowerCase', 'toUpperCase', 'trim', 'toString']);

export function isTypeWrapper(node) {
  return TYPE_WRAPPERS.has(node?.type);
}

export function typeServices(context) {
  const services = context.sourceCode.parserServices;
  return services?.program === undefined || services.program === null ? undefined : services;
}

export function callName(call) {
  const callee = unwrapped(call.callee);
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' ? memberName(callee) : undefined;
}

export function unwrapped(node) {
  const chain = [node];
  for (const current of chain) {
    if (TYPE_WRAPPERS.has(current?.type)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

export function staticKey(property) {
  if (property.type !== 'Property' && property.type !== 'PropertyDefinition') {
    return undefined;
  }
  if (!property.computed && property.key.type === 'Identifier') {
    return property.key.name;
  }
  return (
    stringValue(property.key) ??
    (property.key.type === 'Literal' ? `${property.key.value}` : undefined)
  );
}

function isFreeze(node) {
  const callee = node?.type === 'CallExpression' ? node.callee : undefined;
  return (
    callee?.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Object' &&
    memberName(callee) === 'freeze'
  );
}

function constantValue(context, node) {
  return unwrapped(resolveConstant(context, unwrapped(node)));
}

export function resolvedValue(context, node) {
  const start = constantValue(context, node);
  return chainOf(start, (value) =>
    isFreeze(value) ? constantValue(context, value.arguments[0]) : undefined,
  ).at(-1);
}

function objectProperties(context, node) {
  const object = resolvedValue(context, node);
  return object?.type === 'ObjectExpression' ? object.properties : undefined;
}

function expandSpreads(context, entries) {
  return entries.flatMap(
    (entry) =>
      (entry.type === 'SpreadElement' ? objectProperties(context, entry.argument) : undefined) ?? [
        entry,
      ],
  );
}

function flattenedProperties(context, node) {
  const initial = objectProperties(context, node) ?? [];
  return DEPTHS.reduce((entries) => expandSpreads(context, entries), initial);
}

export function propertyNamed(context, node, name) {
  const found = flattenedProperties(context, node).findLast(
    (entry) => entry.type === 'Property' && staticKey(entry) === name,
  );
  return found?.value;
}

export function memberName(member) {
  if (!member.computed && member.property.type === 'Identifier') {
    return member.property.name;
  }
  return member.computed ? stringValue(member.property) : undefined;
}

function writtenValues(context, identifier) {
  const variable = findVariable(context, identifier, identifier.name);
  if (variable === undefined) {
    return [];
  }
  const defaults = variable.defs
    .map((definition) => definition.name.parent)
    .filter((parent) => parent?.type === 'AssignmentPattern')
    .map((parent) => parent.right);
  const writes = variable.references
    .filter((reference) => reference.isWrite() && reference.writeExpr)
    .map((reference) => reference.writeExpr);
  return [...new Set([...defaults, ...writes])];
}

function lookupValues(context, object) {
  const resolved = resolvedValue(context, object);
  if (resolved?.type === 'ArrayExpression') {
    const elements = resolved.elements;
    return elements.every((element) => element !== null && element.type !== 'SpreadElement')
      ? elements
      : undefined;
  }
  const entries = resolved?.type === 'ObjectExpression' ? flattenedProperties(context, object) : [];
  const plain = entries.length > 0 && entries.every((entry) => entry.type === 'Property');
  return plain ? entries.map((entry) => entry.value) : undefined;
}

function declaredExpansion(context, resolved, name) {
  const declared = declaredMemberValue(context, resolved, name);
  if (declared === undefined) {
    return { leaves: [resolved], next: [] };
  }
  return { leaves: declared.fixed ? [] : [resolved], next: [declared.value] };
}

function memberExpansion(context, resolved) {
  const name = memberName(resolved);
  const target = name === undefined ? undefined : propertyNamed(context, resolved.object, name);
  if (target !== undefined) {
    return { leaves: [], next: [target] };
  }
  const values =
    resolved.computed && name === undefined ? lookupValues(context, resolved.object) : undefined;
  if (values !== undefined) {
    return { leaves: [], next: values };
  }
  return name === undefined
    ? { leaves: [resolved], next: [] }
    : declaredExpansion(context, resolved, name);
}

function forOfElements(context, identifier) {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const declaration = definition?.type === 'Variable' ? definition.parent : undefined;
  const loop = declaration?.parent;
  const direct = definition?.node?.id?.type === 'Identifier';
  if (
    loop?.type !== 'ForOfStatement' ||
    loop.left !== declaration ||
    !direct ||
    declaration.kind !== 'const'
  ) {
    return undefined;
  }
  return lookupValues(context, loop.right);
}

function identifierExpansion(context, resolved) {
  const elements = forOfElements(context, resolved);
  return elements === undefined
    ? { leaves: [resolved], next: writtenValues(context, resolved) }
    : { leaves: [], next: elements };
}

function callExpansion(resolved) {
  const callee = resolved.callee;
  const preserving =
    callee.type === 'MemberExpression' && TEXT_PRESERVING_METHODS.has(memberName(callee));
  return preserving ? { leaves: [], next: [callee.object] } : { leaves: [resolved], next: [] };
}

function expansionOf(context, resolved) {
  switch (resolved.type) {
    case 'ConditionalExpression':
      return { leaves: [], next: [resolved.consequent, resolved.alternate] };
    case 'LogicalExpression':
      return { leaves: [], next: [resolved.left, resolved.right] };
    case 'Identifier':
      return identifierExpansion(context, resolved);
    case 'MemberExpression':
      return memberExpansion(context, resolved);
    case 'CallExpression':
      return callExpansion(resolved);
    default:
      return { leaves: [resolved], next: [] };
  }
}

export function leafValues(context, node) {
  const leaves = [];
  const pending = [{ node, depth: 0 }];
  for (const item of pending) {
    const resolved = unwrapped(resolveConstant(context, unwrapped(item.node)));
    if (resolved === undefined || resolved === null || item.depth > MAX_DEPTH) {
      continue;
    }
    const expansion = expansionOf(context, resolved);
    leaves.push(...expansion.leaves);
    pending.push(...expansion.next.map((child) => ({ node: child, depth: item.depth + 1 })));
  }
  return leaves;
}
