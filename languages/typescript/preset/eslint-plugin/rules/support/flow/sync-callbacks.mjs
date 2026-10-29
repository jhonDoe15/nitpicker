import ts from 'typescript';

const ITERATION_METHODS = [
  'map',
  'forEach',
  'flatMap',
  'filter',
  'reduce',
  'reduceRight',
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'sort',
  'toSorted',
];
const PROMISE_STEPS = ['then', 'catch', 'finally'];
const SCOPE_OPENERS = [
  '$transaction',
  'transaction',
  'transactional',
  'runExclusive',
  'acquire',
  'request',
  'using',
  'afterCommit',
];
const RETRY_WRAPPERS = ['pRetry', 'retry', 'backOff', 'execute'];
const SYNC_CALLEES = new Set([
  ...ITERATION_METHODS,
  ...PROMISE_STEPS,
  ...SCOPE_OPENERS,
  ...RETRY_WRAPPERS,
]);
const PROMISE = 'Promise';

function estreeCalleeName(callee) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : undefined;
}

export function estreeRunsWithCaller(fn) {
  const { parent } = fn;
  if (parent.type === 'CallExpression' && parent.callee === fn) {
    return true;
  }
  const isArgument =
    (parent.type === 'CallExpression' || parent.type === 'NewExpression') &&
    parent.arguments.includes(fn);
  if (!isArgument) {
    return false;
  }
  const name = estreeCalleeName(parent.callee);
  return parent.type === 'NewExpression' ? name === PROMISE : SYNC_CALLEES.has(name);
}

function tsCalleeName(callee) {
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

function tsOuter(fn) {
  const chain = [fn];
  for (const node of chain) {
    if (ts.isParenthesizedExpression(node.parent)) {
      chain.push(node.parent);
    }
  }
  return chain.at(-1);
}

export function tsRunsWithCaller(fn) {
  const outer = tsOuter(fn);
  const { parent } = outer;
  if (ts.isCallExpression(parent) && parent.expression === outer) {
    return true;
  }
  const isArgument =
    (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
    (parent.arguments ?? []).includes(outer);
  if (!isArgument) {
    return false;
  }
  const name = tsCalleeName(parent.expression);
  return ts.isNewExpression(parent) ? name === PROMISE : SYNC_CALLEES.has(name);
}
