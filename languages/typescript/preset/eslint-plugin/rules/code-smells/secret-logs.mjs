import { isSecretName } from '../../../../../../shared/naming/secret-words.mjs';
import { isLogCall } from '../support/error-flow.mjs';
import { staticString } from './secret-values.mjs';

const IDENTIFIER = 'Identifier';
const MEMBER = 'MemberExpression';
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;
const STATUS_NAME = /^(?:has|is)[A-Z_]/;
const GETTER = /^get[A-Z]/;
const TOKENIZER = /tokenizer$/i;
const FLUENT_SINKS = new Set(['addArgument', 'addKeyValue']);
const KEYED_SINKS = new Set(['addKeyValue', 'MDC.put']);
const THROWN = new Set(['NewExpression', 'CallExpression']);
const PASS_THROUGH = new Set([
  'SpreadElement',
  'TSAsExpression',
  'TSNonNullExpression',
  'ChainExpression',
]);

function nameOf(node) {
  if (node?.type === IDENTIFIER) {
    return node.name;
  }
  return node?.type === MEMBER && !node.computed ? node.property.name : undefined;
}

function keyText(key) {
  return key.type === IDENTIFIER ? key.name : staticString(key);
}

function memberNames(node) {
  if (TOKENIZER.test(nameOf(node.object) ?? '')) {
    return [];
  }
  const name = node.computed ? staticString(node.property) : node.property.name;
  return name === undefined ? [] : [{ name }];
}

function getterNames(call) {
  const name = nameOf(call.callee);
  const receiver = call.callee.type === MEMBER ? nameOf(call.callee.object) : undefined;
  const getter = call.arguments.length === 0 && GETTER.test(name ?? '');
  return getter && !TOKENIZER.test(receiver ?? '') ? [{ name }] : [];
}

function pairedName(key, value) {
  const named =
    [IDENTIFIER, MEMBER].includes(value?.type) && !STATUS_NAME.test(nameOf(value) ?? '');
  const name = named && key !== undefined ? keyText(key) : undefined;
  return name === undefined ? [] : [{ name }];
}

function ownNames(node) {
  switch (node.type) {
    case IDENTIFIER:
      return [{ name: node.name, bare: true }];
    case MEMBER:
      return memberNames(node);
    case 'CallExpression':
      return getterNames(node);
    case 'Property':
      return node.computed ? [] : pairedName(node.key, node.value);
    default:
      return [];
  }
}

function loggedChildren(node) {
  if (Array.isArray(node)) {
    return node;
  }
  switch (node?.type) {
    case 'ObjectExpression':
      return node.properties;
    case 'Property':
      return [node.value];
    case 'TemplateLiteral':
      return node.expressions;
    case 'ArrayExpression':
      return node.elements;
    case 'LogicalExpression':
      return [node.left, node.right];
    case 'BinaryExpression':
      return node.operator === '+' ? [node.left, node.right] : [];
    default:
      return PASS_THROUGH.has(node?.type) ? [node.argument ?? node.expression] : [];
  }
}

function isNode(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function namesIn(start) {
  const names = [];
  const pending = [start];
  for (const node of pending) {
    if (isNode(node)) {
      names.push(...ownNames(node));
    }
    pending.push(...loggedChildren(node));
  }
  return names;
}

function calleeText({ callee }) {
  const owner = callee.type === MEMBER ? nameOf(callee.object) : undefined;
  const name = nameOf(callee);
  return owner === undefined ? name : `${owner}.${name}`;
}

function isSink(call) {
  if (call.parent?.type === 'ThrowStatement' && THROWN.has(call.type)) {
    return true;
  }
  if (call.type !== 'CallExpression') {
    return false;
  }
  return (
    isLogCall(call) || FLUENT_SINKS.has(nameOf(call.callee)) || KEYED_SINKS.has(calleeText(call))
  );
}

function isLogged({ name, bare = false }) {
  return isSecretName(name) && !STATUS_NAME.test(name) && !(bare && CONSTANT_NAME.test(name));
}

export function loggedSecretNames(call) {
  if (!isSink(call)) {
    return [];
  }
  const keyed = KEYED_SINKS.has(calleeText(call));
  const [key, value] = call.arguments;
  const names = [...namesIn(call.arguments), ...(keyed ? pairedName(key, value) : [])];
  return [...new Set(names.filter(isLogged).map(({ name }) => name))];
}
