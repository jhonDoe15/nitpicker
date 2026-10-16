import { LOG_LEVEL_METHODS, LOG_NAME_WORDS } from '../../../../../../shared/naming/smell-words.mjs';
import { wordsOf } from './identifier-words.mjs';

const LOG_METHODS = new Set(LOG_LEVEL_METHODS);
const LOG_WORDS = new Set(LOG_NAME_WORDS);
const LOG_OWNER = /^(?:console|pino|winston|bunyan)$|log(?:ger)?$/i;
const STREAM_OWNERS = new Set(['stderr', 'stdout']);
const DISCARDING_FUNCTIONS = new Set(['ignore', 'noop', 'swallow', 'suppress', 'discard']);
const WRAPPER_FUNCTIONS = new Set(['String', 'Number', 'Boolean']);
const WRAPPER_METHODS = new Set(['stringify', 'inspect', 'format']);
const OUTFLOW_PARENTS = new Set(['ReturnStatement', 'ThrowStatement', 'YieldExpression']);
const VALUE_PARENTS = new Set([
  'TemplateLiteral',
  'ArrayExpression',
  'ObjectExpression',
  'SpreadElement',
  'TSAsExpression',
  'TSNonNullExpression',
  'ChainExpression',
  'AwaitExpression',
  'LogicalExpression',
  'NewExpression',
  'ArrowFunctionExpression',
]);

const IDENTIFIER = 'Identifier';
const MEMBER = 'MemberExpression';
const STEP = {
  climb: 'climb',
  stop: 'stop',
  outflow: 'outflow',
  assign: 'assign',
  alias: 'alias',
};

function nameOf(node) {
  if (node?.type === IDENTIFIER) return node.name;
  if (node?.type === MEMBER && !node.computed) return node.property.name;
  return undefined;
}

export function isLogCall(call) {
  const { callee } = call;
  if (callee.type !== MEMBER) return false;
  const owner = nameOf(callee.object) ?? '';
  const method = nameOf(callee.property);
  return (
    (LOG_METHODS.has(method) && LOG_OWNER.test(owner)) ||
    (method === 'write' && STREAM_OWNERS.has(owner))
  );
}

function namesLogging(name) {
  return wordsOf(name ?? '').some((word) => LOG_WORDS.has(word));
}

export function isLoggingCall(call) {
  const { callee } = call;
  if (callee.type !== MEMBER) return namesLogging(nameOf(callee));
  const method = nameOf(callee.property);
  return (
    isLogCall(call) ||
    nameOf(callee.object) === 'console' ||
    LOG_METHODS.has(method) ||
    namesLogging(method)
  );
}

function isWrapperCall({ callee }) {
  if (callee.type === IDENTIFIER) return WRAPPER_FUNCTIONS.has(callee.name);
  return callee.type === MEMBER && WRAPPER_METHODS.has(nameOf(callee.property));
}

function stepThroughCall(call, node) {
  if (call.callee === node) return STEP.climb;
  if (isLoggingCall(call) || DISCARDING_FUNCTIONS.has(nameOf(call.callee))) return STEP.stop;
  return isWrapperCall(call) ? STEP.climb : STEP.outflow;
}

function stepThroughOperator(node, parent) {
  if (parent.type === 'ConditionalExpression') return parent.test === node ? STEP.stop : STEP.climb;
  if (parent.type === 'BinaryExpression') return parent.operator === '+' ? STEP.climb : STEP.stop;
  if (parent.type === MEMBER) return parent.object === node ? STEP.climb : STEP.stop;
  return STEP.stop;
}

function stepFrom(node) {
  const { parent } = node;
  if (OUTFLOW_PARENTS.has(parent.type)) return STEP.outflow;
  if (parent.type === 'CallExpression') return stepThroughCall(parent, node);
  if (parent.type === 'AssignmentExpression')
    return parent.right === node ? STEP.assign : STEP.stop;
  if (parent.type === 'VariableDeclarator') return parent.init === node ? STEP.alias : STEP.stop;
  if (parent.type === 'Property') return parent.value === node ? STEP.climb : STEP.stop;
  return VALUE_PARENTS.has(parent.type) ? STEP.climb : stepThroughOperator(node, parent);
}

function resolveVariable(sourceCode, identifier) {
  const pending = [sourceCode.getScope(identifier)];
  for (const scope of pending) {
    const variable = scope.set.get(identifier.name);
    if (variable) return variable;
    if (scope.upper) pending.push(scope.upper);
  }
  return undefined;
}

function isBareReturn(node) {
  return node.parent.type === 'ReturnStatement' && node.type === IDENTIFIER;
}

function isInside(outer, inner) {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}

export function flowsOut(start, { catchNode, sourceCode, acceptsReturn = () => true }) {
  const seen = new Set();

  function followVariable(target) {
    const variable = target.type === IDENTIFIER ? resolveVariable(sourceCode, target) : undefined;
    if (variable === undefined || seen.has(variable)) return false;
    seen.add(variable);
    return variable.references.some(
      (reference) => reference.identifier !== target && follow(reference.identifier),
    );
  }

  function followAssignment(assignment) {
    const { left } = assignment;
    const variable = left.type === IDENTIFIER ? resolveVariable(sourceCode, left) : undefined;
    if (variable === undefined) return true;
    const declaredInside = variable.defs.some((definition) => isInside(catchNode, definition.name));
    return declaredInside ? followVariable(left) : true;
  }

  function follow(from) {
    const pending = [from];
    for (const node of pending) {
      const step = stepFrom(node);
      if (step === STEP.outflow) return !isBareReturn(node) || acceptsReturn(node.parent);
      if (step === STEP.assign) return followAssignment(node.parent);
      if (step === STEP.alias) return followVariable(node.parent.id);
      if (step === STEP.climb) pending.push(node.parent);
    }
    return false;
  }

  return follow(start);
}
