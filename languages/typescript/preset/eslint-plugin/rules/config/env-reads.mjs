import { isIdentifierNamed } from '../analysis/ancestry.mjs';
import { findVariable, stringValue } from '../analysis/constant-resolution.mjs';

const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'window', 'self']);
const WRAPPERS = new Set(['TSNonNullExpression', 'TSAsExpression', 'TSSatisfiesExpression']);

export function bare(node) {
  const chain = [node];
  for (const current of chain) {
    if (WRAPPERS.has(current.type) || current.type === 'ChainExpression') {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function keyName(computed, key) {
  if (!computed) {
    return key.type === 'Identifier' ? key.name : stringValue(key);
  }
  return stringValue(key);
}

function propertyName(node) {
  return keyName(node.computed, node.property);
}

function isGlobal(context, node, name) {
  return (
    isIdentifierNamed(node, name) && (findVariable(context, node, name)?.defs.length ?? 0) === 0
  );
}

function isProcess(context, node) {
  return (
    isGlobal(context, node, 'process') ||
    (node.type === 'MemberExpression' &&
      node.object.type === 'Identifier' &&
      GLOBAL_OBJECTS.has(node.object.name) &&
      propertyName(node) === 'process')
  );
}

function constDefinition(context, node) {
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === 'Variable' && definition.parent.kind === 'const'
    ? definition
    : undefined;
}

function isDirectEnvObject(context, node) {
  const plain = bare(node);
  if (plain.type !== 'MemberExpression' || propertyName(plain) !== 'env') {
    return false;
  }
  const owner = bare(plain.object);
  return (
    isProcess(context, owner) ||
    isGlobal(context, owner, 'Bun') ||
    (owner.type === 'MetaProperty' && owner.meta.name === 'import')
  );
}

export function isEnvObject(context, node) {
  const plain = bare(node);
  if (plain.type !== 'Identifier') {
    return isDirectEnvObject(context, plain);
  }
  const definition = constDefinition(context, plain);
  return (
    definition?.node.id.type === 'Identifier' &&
    definition.node.init !== null &&
    isDirectEnvObject(context, definition.node.init)
  );
}

function isDenoGet(context, node) {
  const { callee } = node;
  return (
    node.type === 'CallExpression' &&
    callee.type === 'MemberExpression' &&
    propertyName(callee) === 'get' &&
    callee.object.type === 'MemberExpression' &&
    propertyName(callee.object) === 'env' &&
    isGlobal(context, callee.object.object, 'Deno') &&
    node.arguments.length === 1
  );
}

function envVariableOf(context, node) {
  const plain = bare(node);
  if (plain.type === 'MemberExpression' && isEnvObject(context, plain.object)) {
    return propertyName(plain);
  }
  return plain.type === 'CallExpression' && isDenoGet(context, plain)
    ? stringValue(plain.arguments[0])
    : undefined;
}

export function destructuredKey(property) {
  return keyName(property.computed, property.key);
}

function destructuredName(context, definition) {
  const { node } = definition;
  if (node.type !== 'VariableDeclarator' || node.id.type !== 'ObjectPattern') {
    return undefined;
  }
  const entry = node.id.properties.find(
    (property) => property.type === 'Property' && property.value === definition.name,
  );
  return entry !== undefined && node.init !== null && isEnvObject(context, node.init)
    ? destructuredKey(entry)
    : undefined;
}

function aliasedVariable(context, node) {
  const definition = constDefinition(context, node);
  if (definition === undefined) {
    return undefined;
  }
  if (definition.node.id.type === 'Identifier') {
    return definition.node.init === null ? undefined : envVariableOf(context, definition.node.init);
  }
  return destructuredName(context, definition);
}

export function envSubject(context, node) {
  const plain = bare(node);
  return (
    envVariableOf(context, plain) ??
    (plain.type === 'Identifier' ? aliasedVariable(context, plain) : undefined)
  );
}
