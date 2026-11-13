import {
  DISCRIMINANT_KEYS,
  ESLINT_SEVERITIES,
  RULE_KEY_PATTERN,
} from '../../../../../../shared/literals/repeated-literal-exemptions.mjs';

const DISCRIMINANTS = new Set(DISCRIMINANT_KEYS);
const SEVERITIES = new Set(ESLINT_SEVERITIES);
const RULE_KEY = new RegExp(RULE_KEY_PATTERN);
const EQUALITY_OPERATORS = new Set(['===', '!==', '==', '!=']);
const MEMBERSHIP_METHODS = new Set(['includes', 'has']);

function isDiscriminantAccess(node) {
  const access = node?.type === 'ChainExpression' ? node.expression : node;
  return (
    access?.type === 'MemberExpression' &&
    !access.computed &&
    access.property.type === 'Identifier' &&
    DISCRIMINANTS.has(access.property.name)
  );
}

export function isDiscriminantComparison(node, parent) {
  return (
    parent.type === 'BinaryExpression' &&
    EQUALITY_OPERATORS.has(parent.operator) &&
    isDiscriminantAccess(parent.left === node ? parent.right : parent.left)
  );
}

function collectionOf(array) {
  const { parent } = array;
  const isSet =
    parent.type === 'NewExpression' &&
    parent.callee.type === 'Identifier' &&
    parent.callee.name === 'Set' &&
    parent.arguments[0] === array;
  return isSet ? parent : array;
}

export function isDiscriminantList(_node, parent) {
  if (parent.type !== 'ArrayExpression') {
    return false;
  }
  const collection = collectionOf(parent);
  const access = collection.parent;
  const call = access.parent;
  return (
    access.type === 'MemberExpression' &&
    access.object === collection &&
    MEMBERSHIP_METHODS.has(access.property.name) &&
    call.type === 'CallExpression' &&
    call.callee === access &&
    isDiscriminantAccess(call.arguments[0])
  );
}

export function isRuleSeverity(node, parent) {
  const listed = parent.type === 'ArrayExpression' && parent.elements[0] === node;
  const property = listed ? parent.parent : parent;
  return (
    SEVERITIES.has(node.value) &&
    property.type === 'Property' &&
    property.value === (listed ? parent : node) &&
    !property.computed &&
    property.key.type === 'Literal' &&
    RULE_KEY.test(String(property.key.value))
  );
}
