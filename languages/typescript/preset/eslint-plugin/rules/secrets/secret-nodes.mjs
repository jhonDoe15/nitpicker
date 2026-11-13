import { foldTree } from '../../../../../../shared/traversal.mjs';

const WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ChainExpression',
  'AwaitExpression',
]);
const TEXT_PRESERVING_METHODS = new Set(['trim', 'trimStart', 'trimEnd', 'toString', 'normalize']);
const STRING_WRAPPERS = new Set(['String', 'Buffer.from']);
const ENV_OBJECTS = new Set(['process.env', 'import.meta.env', 'Deno.env', 'Bun.env']);

export function unwrapped(node) {
  const pending = [node];
  for (const current of pending) {
    if (!WRAPPERS.has(current.type)) {
      return current;
    }
    pending.push(current.expression ?? current.argument);
  }
  return node;
}

function baseName(inner) {
  if (inner.type === 'Identifier') {
    return inner.name;
  }
  if (inner.type === 'ThisExpression') {
    return 'this';
  }
  return inner.type === 'MetaProperty' ? `${inner.meta.name}.${inner.property.name}` : undefined;
}

export function dottedName(node) {
  const properties = [];
  const pending = [unwrapped(node)];
  for (const inner of pending) {
    if (inner.type !== 'MemberExpression' || inner.computed) {
      const base = baseName(inner);
      return base === undefined ? undefined : [base, ...properties].join('.');
    }
    properties.unshift(inner.property.name ?? '');
    pending.push(unwrapped(inner.object));
  }
  return undefined;
}

export function stringKey(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return node.type === 'TemplateLiteral' && node.expressions.length === 0
    ? node.quasis[0].value.cooked
    : undefined;
}

export function memberName(member) {
  if (!member.computed && member.property.type === 'Identifier') {
    return member.property.name;
  }
  return member.computed ? stringKey(member.property) : undefined;
}

function callLiteral(call) {
  const callee = dottedName(call.callee);
  if (STRING_WRAPPERS.has(callee ?? '') && call.arguments.length > 0) {
    return call.arguments[0];
  }
  const { callee: member } = call;
  const isMethod =
    member.type === 'MemberExpression' &&
    !member.computed &&
    TEXT_PRESERVING_METHODS.has(member.property.name);
  return isMethod ? member.object : undefined;
}

function joinedText(binary) {
  return (parts, part) =>
    parts.length === 0 ? [part] : [{ node: binary, text: parts[0].text + part.text }];
}

function literalChildren(inner) {
  if (inner.type === 'BinaryExpression' && inner.operator === '+') {
    return [inner.left, inner.right];
  }
  if (inner.type === 'LogicalExpression' && inner.operator !== '&&') {
    return [inner.left, inner.right];
  }
  if (inner.type === 'ConditionalExpression') {
    return [inner.consequent, inner.alternate];
  }
  const source = inner.type === 'CallExpression' ? callLiteral(inner) : undefined;
  return source === undefined ? [] : [source];
}

function literalEntries(_node, inner) {
  return stringKey(inner) === undefined
    ? literalChildren(inner).map((child) => [child, unwrapped(child)])
    : [];
}

function combineLiteralParts(_node, inner, childResults) {
  const text = stringKey(inner);
  if (text !== undefined) {
    return [{ node: inner, text }];
  }
  const parts = childResults.flat();
  return inner.type === 'BinaryExpression' ? parts.reduce(joinedText(inner), []) : parts;
}

export function literalParts(node) {
  return foldTree(node, unwrapped(node), { expand: literalEntries, combine: combineLiteralParts });
}

export function envKey(node) {
  const inner = unwrapped(node);
  if (inner.type === 'MemberExpression') {
    const object = dottedName(inner.object);
    return ENV_OBJECTS.has(object ?? '') ? memberName(inner) : undefined;
  }
  const isGet =
    inner.type === 'CallExpression' &&
    dottedName(inner.callee) === 'Deno.env.get' &&
    inner.arguments.length > 0;
  return isGet ? stringKey(inner.arguments[0]) : undefined;
}
