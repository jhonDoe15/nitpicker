import { findVariable, resolveConstant, stringValue } from '../analysis/constant-resolution.mjs';
import { importedCalleeName, moduleBindings } from '../analysis/subprocess-calls.mjs';

const MAX_DEPTH = 8;
const DEPTHS = Array.from({ length: MAX_DEPTH }, (_, index) => index);
const TYPE_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ChainExpression',
]);
const TEXT_PRESERVING_METHODS = new Set(['toLowerCase', 'toUpperCase', 'trim', 'toString']);

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
  if (property.type !== 'Property') {
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

function objectProperties(context, node) {
  const object = unwrapped(resolveConstant(context, unwrapped(node)));
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

function memberExpansion(context, resolved) {
  const name = memberName(resolved);
  const target = name === undefined ? undefined : propertyNamed(context, resolved.object, name);
  return target === undefined ? { leaves: [resolved], next: [] } : { leaves: [], next: [target] };
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
      return { leaves: [resolved], next: writtenValues(context, resolved) };
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

export function bindingsOf(program, modules) {
  return { ...moduleBindings(program, modules), modules };
}

function isRequireOfModule(node, modules) {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require' &&
    modules.has(stringValue(node.arguments[0]))
  );
}

function isBindCall(node) {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    memberName(node.callee) === 'bind'
  );
}

function unaliased(context, node) {
  return unwrapped(resolveConstant(context, unwrapped(node))) ?? node;
}

function aliasTarget(context, callee) {
  const start = unaliased(context, callee);
  return DEPTHS.reduce(
    (current) => (isBindCall(current) ? unaliased(context, current.callee.object) : current),
    start,
  );
}

function destructuredName(context, node, bindings) {
  if (node.type !== 'Identifier') {
    return undefined;
  }
  const definition = findVariable(context, node, node.name)?.defs[0];
  const pattern = definition?.node?.id;
  const init = unwrapped(definition?.node?.init);
  const fromModule =
    init?.type === 'Identifier'
      ? bindings.namespaces.has(init.name)
      : isRequireOfModule(init, bindings.modules);
  if (definition?.type !== 'Variable' || pattern?.type !== 'ObjectPattern' || !fromModule) {
    return undefined;
  }
  const property = pattern.properties.find(
    (entry) =>
      entry.type === 'Property' &&
      (entry.value.name === node.name || entry.value.left?.name === node.name),
  );
  return property === undefined ? undefined : staticKey(property);
}

function requiredMemberName(target, bindings) {
  const isMember = target.type === 'MemberExpression' && !target.computed;
  return isMember && isRequireOfModule(target.object, bindings.modules)
    ? memberName(target)
    : undefined;
}

export function importedFunction(context, callee, bindings) {
  const target = unwrapped(aliasTarget(context, callee));
  return (
    importedCalleeName(target, bindings) ??
    destructuredName(context, target, bindings) ??
    requiredMemberName(target, bindings)
  );
}
