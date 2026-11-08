import { findVariable, stringValue } from '../analysis/constant-resolution.mjs';

const ESCAPE_NAME = /escape/iu;
const PATTERN_NAME = /reg|pattern/iu;
const REPLACE_METHODS = new Set(['replace', 'replaceAll']);
const MATCHED_TEXT = String.raw`\$&`;
const MAX_DEPTH = 8;
const MODULE_SCOPES = new Set(['module', 'global']);
const LOOP_BINDINGS = new Set(['ForOfStatement', 'ForInStatement']);

function isNamedEscape(node) {
  const named = node.type === 'Identifier' || node.type === 'PrivateIdentifier';
  return named && ESCAPE_NAME.test(node.name) && PATTERN_NAME.test(node.name);
}

function isRegExpEscape(node) {
  return (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'RegExp' &&
    node.property.name === 'escape'
  );
}

function isInlineEscape(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    REPLACE_METHODS.has(node.callee.property.name) &&
    stringValue(node.arguments[1]) === MATCHED_TEXT
  );
}

function isEscape(node) {
  return isNamedEscape(node) || isRegExpEscape(node) || isInlineEscape(node);
}

function valueChildren(visitorKeys, node) {
  return node.type === 'ConditionalExpression'
    ? [node.consequent, node.alternate]
    : childNodes(visitorKeys, node);
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
    if (isEscape(node)) {
      return undefined;
    }
    if (node.type === 'Identifier' && !isNameOnly(parent, node)) {
      identifiers.push(node);
    }
    pending.push(
      ...valueChildren(visitorKeys, node).map((child) => ({ node: child, parent: node })),
    );
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

function nextValue(context, identifier) {
  const variable = findVariable(context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (definition?.type === 'Parameter') {
    const receiver = callbackReceiver(definition.node);
    return receiver === undefined ? { input: true } : { value: receiver };
  }
  if (definition?.type !== 'Variable' || MODULE_SCOPES.has(variable.scope.type)) {
    return {};
  }
  return { value: boundValue(definition) };
}

function nextNodes(context, current, depth) {
  const identifiers =
    depth > MAX_DEPTH ? [] : referencedIdentifiers(context.sourceCode.visitorKeys, current);
  return (identifiers ?? []).map((identifier) => nextValue(context, identifier));
}

export function dependsOnInput(context, node) {
  const pending = [{ node, depth: 0 }];
  for (const { node: current, depth } of pending) {
    const next = nextNodes(context, current, depth);
    if (next.some(({ input }) => input)) {
      return true;
    }
    pending.push(
      ...next
        .filter(({ value }) => value !== undefined)
        .map(({ value }) => ({ node: value, depth: depth + 1 })),
    );
  }
  return false;
}
