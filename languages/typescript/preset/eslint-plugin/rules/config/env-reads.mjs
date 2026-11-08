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

function isNamed(node, name) {
  return node.type === 'Identifier' && node.name === name;
}

function isProcess(node) {
  return (
    isNamed(node, 'process') ||
    (node.type === 'MemberExpression' &&
      node.object.type === 'Identifier' &&
      GLOBAL_OBJECTS.has(node.object.name) &&
      propertyName(node) === 'process')
  );
}

export function isEnvObject(node) {
  const plain = bare(node);
  if (plain.type !== 'MemberExpression' || propertyName(plain) !== 'env') {
    return false;
  }
  const owner = bare(plain.object);
  return (
    isProcess(owner) ||
    isNamed(owner, 'Bun') ||
    (owner.type === 'MetaProperty' && owner.meta.name === 'import')
  );
}

function isDenoGet(node) {
  const { callee } = node;
  return (
    node.type === 'CallExpression' &&
    callee.type === 'MemberExpression' &&
    propertyName(callee) === 'get' &&
    callee.object.type === 'MemberExpression' &&
    propertyName(callee.object) === 'env' &&
    isNamed(callee.object.object, 'Deno') &&
    node.arguments.length === 1
  );
}

function envVariableOf(node) {
  const plain = bare(node);
  if (plain.type === 'MemberExpression' && isEnvObject(plain.object)) {
    return propertyName(plain);
  }
  return plain.type === 'CallExpression' && isDenoGet(plain)
    ? stringValue(plain.arguments[0])
    : undefined;
}

function isEnvRead(node) {
  return envVariableOf(node) !== undefined;
}

function destructuredName(definition) {
  const { node } = definition;
  if (node.type !== 'VariableDeclarator' || node.id.type !== 'ObjectPattern') {
    return undefined;
  }
  const entry = node.id.properties.find(
    (property) => property.type === 'Property' && property.value === definition.name,
  );
  return entry !== undefined && node.init !== null && isEnvObject(node.init)
    ? keyName(entry.computed, entry.key)
    : undefined;
}

function aliasedVariable(context, node) {
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (definition?.type !== 'Variable' || definition.parent.kind !== 'const') {
    return undefined;
  }
  if (definition.node.id.type === 'Identifier') {
    return definition.node.init === null ? undefined : envVariableOf(definition.node.init);
  }
  return destructuredName(definition);
}

export function envSubject(context, node) {
  const plain = bare(node);
  if (isEnvRead(plain)) {
    return envVariableOf(plain);
  }
  return plain.type === 'Identifier' ? aliasedVariable(context, plain) : undefined;
}
