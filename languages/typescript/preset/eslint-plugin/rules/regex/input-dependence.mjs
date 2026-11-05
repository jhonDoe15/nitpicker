import { findVariable } from '../analysis/constant-resolution.mjs';

const ESCAPE_NAME = /escape/iu;
const MAX_DEPTH = 8;
const MODULE_SCOPES = new Set(['module', 'global']);
const LOOP_BINDINGS = new Set(['ForOfStatement', 'ForInStatement']);

function isNamedEscape(node) {
  return (
    (node.type === 'Identifier' || node.type === 'PrivateIdentifier') && ESCAPE_NAME.test(node.name)
  );
}

function childNodes(visitorKeys, node) {
  const keys = visitorKeys[node.type] ?? [];
  return keys
    .flatMap((key) => node[key] ?? [])
    .filter((child) => child !== null && typeof child.type === 'string');
}

function isNameOnly(parent, node) {
  return (
    (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) ||
    (parent?.type === 'Property' && parent.key === node && !parent.computed)
  );
}

function referencedIdentifiers(visitorKeys, root) {
  const pending = [{ node: root, parent: undefined }];
  const identifiers = [];
  for (const { node, parent } of pending) {
    if (isNamedEscape(node)) {
      return undefined;
    }
    if (node.type === 'Identifier' && !isNameOnly(parent, node)) {
      identifiers.push(node);
    }
    pending.push(...childNodes(visitorKeys, node).map((child) => ({ node: child, parent: node })));
  }
  return identifiers;
}

function callbackReceiver(fn) {
  const call = fn.parent;
  const isCallback =
    call?.type === 'CallExpression' &&
    call.arguments.includes(fn) &&
    call.callee.type === 'MemberExpression';
  return isCallback ? call.callee.object : undefined;
}

function boundValue(definition) {
  if (definition.node.init) {
    return definition.node.init;
  }
  const holder = definition.parent?.parent;
  return LOOP_BINDINGS.has(holder?.type) ? holder.right : undefined;
}

export function dependsOnInput(context, node, depth = 0) {
  if (depth > MAX_DEPTH) {
    return false;
  }
  const identifiers = referencedIdentifiers(context.sourceCode.visitorKeys, node);
  return (identifiers ?? []).some((identifier) => {
    const variable = findVariable(context, identifier, identifier.name);
    const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
    if (definition?.type === 'Parameter') {
      const receiver = callbackReceiver(definition.node);
      return receiver === undefined || dependsOnInput(context, receiver, depth + 1);
    }
    if (definition?.type !== 'Variable' || MODULE_SCOPES.has(variable.scope.type)) {
      return false;
    }
    const value = boundValue(definition);
    return value !== undefined && dependsOnInput(context, value, depth + 1);
  });
}
