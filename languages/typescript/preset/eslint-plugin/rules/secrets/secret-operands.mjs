import { isSecretName } from '../../../../../../shared/naming/secret-words.mjs';
import { foldTree } from '../../../../../../shared/traversal.mjs';
import { envKey, memberName, unwrapped } from './secret-nodes.mjs';

const STATE_PREFIX = /^(?:has|is)[A-Z_]/;
const SCREAMING_CASE = /^[A-Z][A-Z0-9_]*$/;
const NOT_SECRET_OWNERS = new Set(['tokenizer', 'tokenizers']);
const TEXT_CALLS = new Set(['String', 'JSON.stringify']);
const PLAIN_VALUES = new Set(['Identifier', 'MemberExpression', 'TemplateLiteral']);

function namesASecret(name) {
  return (
    name !== undefined &&
    !STATE_PREFIX.test(name) &&
    !SCREAMING_CASE.test(name) &&
    isSecretName(name)
  );
}

function ownerName(member) {
  const object = unwrapped(member.object);
  return object.type === 'Identifier' ? object.name.toLowerCase() : undefined;
}

function propertyKeyName(property) {
  if (property.computed) {
    return property.key.type === 'Literal' ? String(property.key.value) : undefined;
  }
  return property.key.type === 'Identifier' ? property.key.name : String(property.key.value);
}

function isPlainValue(value) {
  const inner = unwrapped(value);
  return (
    PLAIN_VALUES.has(inner.type) && !(inner.type === 'Identifier' && inner.name === 'undefined')
  );
}

function namedProperty(property) {
  return namesASecret(propertyKeyName(property)) && isPlainValue(property.value);
}

function callTarget(call) {
  const callee = unwrapped(call.callee);
  const name = callee.type === 'Identifier' ? callee.name : undefined;
  const object = callee.type === 'MemberExpression' ? unwrapped(callee.object) : undefined;
  const qualified = object?.type === 'Identifier' ? `${object.name}.${memberName(callee)}` : name;
  if (TEXT_CALLS.has(qualified ?? '') && call.arguments.length > 0) {
    return call.arguments[0];
  }
  const toString = callee.type === 'MemberExpression' && memberName(callee) === 'toString';
  return toString ? callee.object : undefined;
}

function memberOperand(member) {
  const key = envKey(member);
  const secret =
    key === undefined
      ? namesASecret(memberName(member))
      : isSecretName(key) && !STATE_PREFIX.test(key);
  return secret && !NOT_SECRET_OWNERS.has(ownerName(member) ?? '') ? [member] : [];
}

function operandChildren(inner) {
  switch (inner.type) {
    case 'TemplateLiteral':
      return inner.expressions;
    case 'BinaryExpression':
      return inner.operator === '+' ? [inner.left, inner.right] : [];
    case 'LogicalExpression':
      return inner.operator === '&&' ? [inner.right] : [inner.left, inner.right];
    case 'ConditionalExpression':
      return [inner.consequent, inner.alternate];
    case 'ArrayExpression':
      return inner.elements.filter((element) => element !== null);
    case 'CallExpression':
      return [callTarget(inner)].filter((target) => target !== undefined);
    default:
      return [];
  }
}

function operandEntries(node, kept) {
  if (kept !== undefined) {
    return [];
  }
  const inner = unwrapped(node);
  if (inner.type === 'ObjectExpression') {
    return inner.properties
      .filter((property) => property.type !== 'SpreadElement')
      .map((property) => [property.value, namedProperty(property) ? [property] : undefined]);
  }
  return operandChildren(inner).map((child) => [child, undefined]);
}

function combineOperands(node, kept, childResults) {
  if (kept !== undefined) {
    return kept;
  }
  const inner = unwrapped(node);
  if (inner.type === 'Identifier') {
    return namesASecret(inner.name) ? [inner] : [];
  }
  return inner.type === 'MemberExpression' ? memberOperand(inner) : childResults.flat();
}

export function secretOperands(node) {
  return foldTree(node, undefined, { expand: operandEntries, combine: combineOperands });
}
