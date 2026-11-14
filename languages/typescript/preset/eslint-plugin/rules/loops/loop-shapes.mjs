import { ancestorsOf, contains } from '../analysis/ancestry.mjs';
import { hasCollectionType } from '../support/checked-types.mjs';
import { isConcurrentBatch } from './concurrent-batches.mjs';

const LOOPS = new Set([
  'ForOfStatement',
  'ForInStatement',
  'ForStatement',
  'WhileStatement',
  'DoWhileStatement',
]);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const ITERATION_METHODS = new Set([
  'map',
  'forEach',
  'flatMap',
  'filter',
  'reduce',
  'some',
  'every',
  'find',
  'findIndex',
  'reduceRight',
  'findLast',
  'findLastIndex',
  'sort',
  'toSorted',
]);
const IDENTIFIER = 'Identifier';
const MEMBER = 'MemberExpression';
const ASSIGNMENT = 'AssignmentExpression';
const ARITHMETIC_OPERATORS = new Set(['+', '-', '*', '/', '%', '**']);
const LOOP_EXITS = new Set(['ThrowStatement', 'ReturnStatement', 'BreakStatement']);
const BREAK_TARGETS = new Set([...LOOPS, 'SwitchStatement']);

export function childrenOf(node, visitorKeys) {
  return (visitorKeys[node.type] ?? []).flatMap((key) => [node[key]].flat()).filter(Boolean);
}

function descendants(root, visitorKeys, isBoundary) {
  const found = [];
  const pending = [root];
  for (const node of pending) {
    found.push(node);
    if (node === root || !isBoundary(node)) {
      pending.push(...childrenOf(node, visitorKeys));
    }
  }
  return found;
}

function isLoopBody(loop, child) {
  return child === loop.body || child === loop.test || child === loop.update;
}

function isIterationCallback(fn, context) {
  const call = fn.parent;
  if (
    call.type !== 'CallExpression' ||
    !call.arguments.includes(fn) ||
    call.callee.type !== MEMBER
  ) {
    return false;
  }
  const { object, property } = call.callee;
  const mapsFrom = property.name === 'from' && object.name === 'Array' && call.arguments[1] === fn;
  const iterates =
    ITERATION_METHODS.has(property.name) && hasCollectionType(context, object) !== false;
  return mapsFrom || iterates;
}

export function isIterationCall(call) {
  const { callee } = call;
  return callee.type === MEMBER && !callee.computed && ITERATION_METHODS.has(callee.property.name);
}

export function enclosingLoop(node, context) {
  let child = node;
  for (const parent of ancestorsOf(node)) {
    if (LOOPS.has(parent.type) && isLoopBody(parent, child)) {
      return { loop: parent, child };
    }
    if (FUNCTIONS.has(parent.type)) {
      return isIterationCallback(parent, context)
        ? { callback: parent, concurrent: isConcurrentBatch(parent, context.sourceCode) }
        : undefined;
    }
    child = parent;
  }
  return undefined;
}

function breaksOut(node, block) {
  const inner = ancestorsOf(node).filter((ancestor) => contains(block, ancestor));
  return node.label === null && !inner.some((ancestor) => BREAK_TARGETS.has(ancestor.type));
}

function exitsLoop(block, visitorKeys) {
  const nodes = descendants(block, visitorKeys, (node) => FUNCTIONS.has(node.type));
  return nodes.some(
    (node) =>
      node.type === 'ReturnStatement' || (node.type === 'BreakStatement' && breaksOut(node, block)),
  );
}

function retryingTry(loop, call) {
  const statements = loop.body.type === 'BlockStatement' ? loop.body.body : [loop.body];
  return statements.find(
    (statement) => statement.type === 'TryStatement' && contains(statement.block, call),
  );
}

export function isRetryAttempt(call, loop, visitorKeys) {
  const attempt = loop === undefined ? undefined : retryingTry(loop, call);
  const handler = attempt?.handler;
  if (handler === undefined || handler === null) {
    return false;
  }
  const continues = !handler.body.body.some((statement) => LOOP_EXITS.has(statement.type));
  return continues && exitsLoop(attempt.block, visitorKeys);
}

function isArithmeticSelfUpdate({ operator, left, right }) {
  if (operator !== '=') {
    return ARITHMETIC_OPERATORS.has(operator.slice(0, -1));
  }
  return (
    right.type === 'BinaryExpression' &&
    ARITHMETIC_OPERATORS.has(right.operator) &&
    [right.left, right.right].some((side) => side.type === IDENTIFIER && side.name === left.name)
  );
}

function isOpenLoop(loop) {
  const { test } = loop;
  return test === null || test === undefined || (test.type === 'Literal' && test.value === true);
}

function isUnit(node) {
  const value = node.type === 'UnaryExpression' ? node.argument : node;
  return value.type === 'Literal' && value.value === 1;
}

function isCounterStep({ operator, left, right }) {
  if (operator !== '=') {
    return isUnit(right);
  }
  const step =
    right.left.type === IDENTIFIER && right.left.name === left.name ? right.right : right.left;
  return isUnit(step);
}

function steppedNames(loop, visitorKeys) {
  const roots = [loop.body, loop.update].filter((node) => node !== null && node !== undefined);
  return new Set(
    roots
      .flatMap((root) => descendants(root, visitorKeys, (node) => FUNCTIONS.has(node.type)))
      .filter((node) => node.type === ASSIGNMENT && node.left.type === IDENTIFIER)
      .filter((node) => isArithmeticSelfUpdate(node) && !isCounterStep(node))
      .map((node) => node.left.name),
  );
}

function isCountingLoop(loop) {
  return loop === undefined || loop.type === 'ForOfStatement' || loop.type === 'ForInStatement';
}

function isPagingLoop(loop, visitorKeys) {
  if (isOpenLoop(loop)) {
    return true;
  }
  const tested = new Set(
    descendants(loop.test, visitorKeys, (node) => FUNCTIONS.has(node.type))
      .filter((node) => node.type === IDENTIFIER)
      .map(({ name }) => name),
  );
  return descendants(loop.body, visitorKeys, (node) => FUNCTIONS.has(node.type)).some(
    (node) =>
      node.type === ASSIGNMENT &&
      node.left.type === IDENTIFIER &&
      tested.has(node.left.name) &&
      !isArithmeticSelfUpdate(node),
  );
}

function isReference(identifier) {
  const { parent } = identifier;
  const isProperty =
    (parent.type === MEMBER && parent.property === identifier && !parent.computed) ||
    (parent.type === 'Property' && parent.key === identifier && !parent.shorthand);
  return identifier.type === IDENTIFIER && !isProperty;
}

function namesIn(node, visitorKeys) {
  return new Set(
    descendants(node, visitorKeys, (each) => FUNCTIONS.has(each.type))
      .filter(isReference)
      .map(({ name }) => name),
  );
}

function loopAssignments(loop, visitorKeys) {
  const nodes = descendants(loop.body, visitorKeys, (node) => FUNCTIONS.has(node.type));
  const varying = new Map();
  for (const node of nodes) {
    const target = node.type === ASSIGNMENT ? node.left : node.id;
    const value = node.type === ASSIGNMENT ? node.right : node.init;
    const assigns = [ASSIGNMENT, 'VariableDeclarator'].includes(node.type);
    if (assigns && target.type === IDENTIFIER && value) {
      const sources = [...namesIn(value, visitorKeys)].filter((name) => name !== target.name);
      const carried = node.type === ASSIGNMENT && sources.length > 0;
      varying.set(target.name, carried || sources.some((name) => varying.get(name) === true));
    }
  }
  return varying;
}

function isPolling(call, loop) {
  return loop.test !== null && loop.test !== undefined && contains(loop.test, call);
}

export function isPagingCall(call, loop, visitorKeys) {
  if (isCountingLoop(loop)) {
    return false;
  }
  const inputs = (call.arguments ?? []).flatMap((argument) => [...namesIn(argument, visitorKeys)]);
  const stepped = steppedNames(loop, visitorKeys);
  if (isPolling(call, loop) || inputs.some((name) => stepped.has(name))) {
    return true;
  }
  if (!isPagingLoop(loop, visitorKeys)) {
    return false;
  }
  const varying = loopAssignments(loop, visitorKeys);
  const changing = inputs.filter((name) => varying.has(name));
  const carried = changing.some((name) => varying.get(name));
  return isOpenLoop(loop) ? carried : changing.length === 0 || carried;
}
