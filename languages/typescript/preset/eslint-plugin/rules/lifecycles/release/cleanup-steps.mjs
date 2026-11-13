import {
  functionName,
  isCloseName,
  isFunctionNode,
  unwrapExpression,
} from '../scope/close-scopes.mjs';
import { ancestorsOf } from '../../analysis/ancestry.mjs';

const RELEASE_METHODS = new Set([
  'close',
  'disconnect',
  'destroy',
  'end',
  'quit',
  'stop',
  'terminate',
  'unsubscribe',
  'dispose',
]);
const TEST_HOOKS = new Set(['afterAll', 'afterEach', 'after']);
const SHUTDOWN_HOOKS = new Set(['onClose', 'onShutdown', 'onExit']);
const SIGNALS = new Set(['SIGTERM', 'SIGINT', 'SIGHUP', 'beforeExit']);
const RESET_VALUES = new Set(['Literal', 'NewExpression', 'ArrayExpression', 'ObjectExpression']);

function calleeName(callee) {
  return callee.type === 'MemberExpression' ? callee.property.name : callee.name;
}

function hookCallback(fn) {
  const call = fn.parent;
  if (call.type !== 'CallExpression' || !call.arguments.includes(fn)) {
    return false;
  }
  const name = calleeName(call.callee);
  const [first] = call.arguments;
  return (
    TEST_HOOKS.has(name) ||
    SHUTDOWN_HOOKS.has(name) ||
    (name === 'addHook' && first?.type === 'Literal' && SHUTDOWN_HOOKS.has(first.value)) ||
    (['on', 'once'].includes(name) && first.type === 'Literal' && SIGNALS.has(first.value))
  );
}

export function isCleanupFunction(fn) {
  return isCloseName(functionName(fn)) || hookCallback(fn);
}

export function nearestFunction(node) {
  return ancestorsOf(node).find(isFunctionNode);
}

export function releaseCall(expression) {
  const call = unwrapExpression(expression);
  const callee = call.type === 'CallExpression' ? unwrapExpression(call.callee) : undefined;
  return callee?.type === 'MemberExpression' &&
    !callee.computed &&
    RELEASE_METHODS.has(callee.property.name)
    ? call
    : undefined;
}

function singleStatement(statement) {
  return statement.type === 'BlockStatement' && statement.body.length === 1
    ? statement.body[0]
    : statement;
}

const NESTING = [0, 1, 2, 3];

function innerStatement(statement) {
  if (statement.type === 'IfStatement' && statement.alternate === null) {
    return singleStatement(statement.consequent);
  }
  if (['ForOfStatement', 'ForInStatement'].includes(statement.type)) {
    return singleStatement(statement.body);
  }
  if (statement.type === 'ReturnStatement' && statement.argument !== null) {
    return { type: 'ExpressionStatement', expression: statement.argument };
  }
  return undefined;
}

function stepStatement(statement) {
  return NESTING.reduce((step) => innerStatement(step) ?? step, statement);
}

export function firstRelease(statement) {
  const step = stepStatement(statement);
  const { expression } = step;
  if (step.type !== 'ExpressionStatement') {
    return undefined;
  }
  return releaseCall(expression.type === 'AwaitExpression' ? expression.argument : expression);
}

function isReset(expression) {
  if (expression.type === 'AssignmentExpression') {
    const { right } = expression;
    return (
      (right.type === 'Identifier' && right.name === 'undefined') || RESET_VALUES.has(right.type)
    );
  }
  const call = unwrapExpression(expression);
  return (
    call.type === 'CallExpression' &&
    call.callee.type === 'MemberExpression' &&
    call.callee.property.name === 'clear'
  );
}

export function laterStep(sourceCode, original) {
  const statement = stepStatement(original);
  if (statement.type !== 'ExpressionStatement') {
    return undefined;
  }
  const { expression } = statement;
  const target = expression.type === 'AwaitExpression' ? expression.argument : expression;
  const call = releaseCall(target);
  if (call !== undefined) {
    return `${sourceCode.getText(call.callee)}()`;
  }
  return isReset(expression) ? sourceCode.getText(expression.left ?? expression.callee) : undefined;
}
