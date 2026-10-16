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
]);
const CONCURRENT_COMBINATORS = new Set(['all', 'allSettled', 'any', 'race']);
const LOOP_EXITS = new Set(['ThrowStatement', 'ReturnStatement', 'BreakStatement']);
const BREAK_TARGETS = new Set([...LOOPS, 'SwitchStatement']);

function ancestorsOf(node) {
  const ancestors = [];
  const pending = [node.parent];
  for (const ancestor of pending) {
    if (ancestor) {
      ancestors.push(ancestor);
      pending.push(ancestor.parent);
    }
  }
  return ancestors;
}

function childrenOf(node, visitorKeys) {
  return (visitorKeys[node.type] ?? []).flatMap((key) => [node[key]].flat()).filter(Boolean);
}

function descendants(root, visitorKeys, isBoundary) {
  const found = [];
  const pending = [root];
  for (const node of pending) {
    found.push(node);
    if (node === root || !isBoundary(node)) pending.push(...childrenOf(node, visitorKeys));
  }
  return found;
}

function isLoopBody(loop, child) {
  return child === loop.body || child === loop.test || child === loop.update;
}

function isIterationCallback(fn) {
  const call = fn.parent;
  return (
    call.type === 'CallExpression' &&
    call.arguments.includes(fn) &&
    call.callee.type === 'MemberExpression' &&
    ITERATION_METHODS.has(call.callee.property.name)
  );
}

function isConcurrentBatch(callback) {
  const outer = callback.parent.parent;
  const { callee } = outer ?? {};
  return (
    outer?.type === 'CallExpression' &&
    callee.type === 'MemberExpression' &&
    callee.object.name === 'Promise' &&
    CONCURRENT_COMBINATORS.has(callee.property.name)
  );
}

export function enclosingLoop(node) {
  let child = node;
  for (const parent of ancestorsOf(node)) {
    if (LOOPS.has(parent.type) && isLoopBody(parent, child)) return { loop: parent, child };
    if (FUNCTIONS.has(parent.type)) {
      const sequential = isIterationCallback(parent) && !isConcurrentBatch(parent);
      return sequential ? { callback: parent } : undefined;
    }
    child = parent;
  }
  return undefined;
}

export function contains(outer, inner) {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
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
  if (handler === undefined || handler === null) return false;
  const continues = !handler.body.body.some((statement) => LOOP_EXITS.has(statement.type));
  return continues && exitsLoop(attempt.block, visitorKeys);
}

export function isPagingLoop(loop, visitorKeys) {
  if (loop === undefined || loop.test === null || loop.test === undefined) return false;
  if (loop.type === 'ForOfStatement' || loop.type === 'ForInStatement') return false;
  const tested = new Set(
    descendants(loop.test, visitorKeys, (node) => FUNCTIONS.has(node.type))
      .filter((node) => node.type === 'Identifier')
      .map(({ name }) => name),
  );
  return descendants(loop.body, visitorKeys, (node) => FUNCTIONS.has(node.type)).some(
    (node) =>
      node.type === 'AssignmentExpression' &&
      node.left.type === 'Identifier' &&
      tested.has(node.left.name),
  );
}
