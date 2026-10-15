import { isLogCall } from '../support/error-flow.mjs';

const MEMBER = 'MemberExpression';
const LITERAL = 'Literal';
const CALL = 'CallExpression';
const STATUS = 'status';
const FAILED_FLAGS = new Set(['ok', 'success', 'succeeded']);
const ERROR_KEYS = new Set(['error', 'errors', 'failure', 'cause']);
const OUTCOME_KEYS = new Set(['kind', 'type', STATUS, 'outcome', 'result', 'variant', 'severity']);
const FAILURE_WORDS =
  /error|fail|invalid|malformed|missing|not[-_ ]?found|denied|forbidden|unavailable|timeout|rejected|unreadable/i;
const FAILURE_CONSTRUCTORS = /^(?:err|error|fail|failure|failed|left)$/i;
const ERROR_STATUS_METHODS = new Set([STATUS, 'code', 'sendStatus', 'writeHead']);
const ERROR_SETTER = /^set(?=[A-Z])\w*(?:Error|Failure|Failed)\w*$/;
const SETTER = /^set[A-Z]/;
const LOWEST_ERROR_STATUS = 400;

function keyName(property) {
  if (property.type !== 'Property' || property.computed) return undefined;
  return property.key.type === 'Identifier' ? property.key.name : property.key.value;
}

function calleeName({ callee }) {
  return callee.type === MEMBER ? callee.property.name : callee.name;
}

function isErrorStatus(node) {
  return (
    node?.type === LITERAL && typeof node.value === 'number' && node.value >= LOWEST_ERROR_STATUS
  );
}

function isAbsent(node) {
  return (
    (node.type === LITERAL && (node.value === null || node.value === false)) ||
    (node.type === 'Identifier' && node.name === 'undefined')
  );
}

function isFailureProperty(property) {
  const key = keyName(property);
  const { value } = property;
  if (FAILED_FLAGS.has(key)) return value.type === LITERAL && value.value === false;
  if (ERROR_KEYS.has(key)) return !isAbsent(value);
  if (key === STATUS && isErrorStatus(value)) return true;
  return (
    OUTCOME_KEYS.has(key) && typeof value.value === 'string' && FAILURE_WORDS.test(value.value)
  );
}

function isFailureString(node) {
  return node?.type === LITERAL && typeof node.value === 'string' && FAILURE_WORDS.test(node.value);
}

export function isFailureResult(node) {
  if (node?.type === 'ObjectExpression') return node.properties.some(isFailureProperty);
  if (node?.type === CALL && isLogCall(node)) return false;
  if (node?.type !== CALL && node?.type !== 'NewExpression') return false;
  const named = node.type === CALL && FAILURE_CONSTRUCTORS.test(calleeName(node) ?? '');
  return named || passesFailure(node);
}

function isProcessExit({ callee }) {
  return (
    callee.type === MEMBER && callee.object.name === 'process' && callee.property.name === 'exit'
  );
}

function isErrorResponse(call) {
  const name = calleeName(call);
  return (
    ERROR_STATUS_METHODS.has(name) &&
    call.callee.type === MEMBER &&
    isErrorStatus(call.arguments[0])
  );
}

function showsError(call) {
  const name = calleeName(call) ?? '';
  if (ERROR_SETTER.test(name)) return true;
  if (SETTER.test(name) && call.arguments.some(isFailureString)) return true;
  return name === 'error' && call.callee.type === MEMBER && !isLogCall(call);
}

function passesFailure(call) {
  return call.arguments.some(
    (argument) => argument.type === 'ObjectExpression' && isFailureResult(argument),
  );
}

export function reportsFailure(call) {
  if (isLogCall(call)) return false;
  return isProcessExit(call) || isErrorResponse(call) || showsError(call) || passesFailure(call);
}

export function setsFailureState({ left, right }) {
  if (left.type !== MEMBER) return false;
  const owner = left.object.name;
  const property = left.property.name;
  if (owner === 'process' && property === 'exitCode') return true;
  return property === 'statusCode' && isErrorStatus(right);
}
