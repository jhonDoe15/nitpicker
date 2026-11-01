import { chainOf } from '../ancestry.mjs';
import { findVariable, stringValue } from '../constant-resolution.mjs';

const PROCESS_MODULES = new Set(['process', 'node:process']);
const GLOBAL_OBJECTS = ['globalThis', 'global', 'window', 'self'];
const WRAPPERS = new Set([
  'TSAsExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
]);
const MAX_CHAIN_LENGTH = 8;

export function isProcessModule(source) {
  return PROCESS_MODULES.has(source);
}

export function wrapperTop(node) {
  return chainOf(node, (current) =>
    WRAPPERS.has(current.parent?.type) ? current.parent : undefined,
  ).at(-1);
}

export function staticName(member) {
  if (!member.computed) {
    return member.property.type === 'Identifier' ? member.property.name : undefined;
  }
  return member.property.type === 'Literal' ? String(member.property.value) : undefined;
}

export function propertyName(property) {
  const { key } = property;
  if (!property.computed) {
    return key.type === 'Identifier' ? key.name : stringValue(key);
  }
  return stringValue(key);
}

function constantInit(context, node) {
  const variable = node.type === 'Identifier' ? findVariable(context, node, node.name) : undefined;
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  const isPlain = definition?.type === 'Variable' && definition.node.id.type === 'Identifier';
  return isPlain ? (definition.node.init ?? undefined) : undefined;
}

function nextInChain(context, node) {
  if (WRAPPERS.has(node.type)) {
    return node.expression;
  }
  if (node.type === 'AwaitExpression') {
    return node.argument;
  }
  return constantInit(context, node);
}

function valueChain(context, node) {
  const chain = [node];
  for (const current of chain) {
    const next = chain.length < MAX_CHAIN_LENGTH ? nextInChain(context, current) : undefined;
    if (next !== undefined) {
      chain.push(next);
    }
  }
  return chain;
}

function isGlobalNamed(context, node, names) {
  if (node.type !== 'Identifier' || !names.includes(node.name)) {
    return false;
  }
  const variable = findVariable(context, node, node.name);
  return variable === undefined || variable.defs.length === 0;
}

export function isGlobalObject(context, node) {
  return valueChain(context, node).some((step) => isGlobalNamed(context, step, GLOBAL_OBJECTS));
}

function isProcessImport(context, node) {
  const definition = findVariable(context, node, node.name)?.defs.at(0);
  return (
    definition?.type === 'ImportBinding' &&
    definition.node.type !== 'ImportSpecifier' &&
    definition.parent.importKind !== 'type' &&
    isProcessModule(definition.parent.source.value)
  );
}

function isModuleLoad(node) {
  const isRequire =
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require';
  const source = isRequire ? node.arguments[0] : node.source;
  return (isRequire || node.type === 'ImportExpression') && isProcessModule(stringValue(source));
}

function isProcessStep(context, node) {
  if (node.type === 'Identifier') {
    return isGlobalNamed(context, node, ['process']) || isProcessImport(context, node);
  }
  if (node.type === 'MemberExpression') {
    return staticName(node) === 'process' && isGlobalObject(context, node.object);
  }
  return isModuleLoad(node);
}

export function isProcessValue(context, node) {
  return valueChain(context, node).some((step) => isProcessStep(context, step));
}
