import { ancestorsOf } from '../analysis/ancestry.mjs';
import { findVariable } from '../analysis/constant-resolution.mjs';
import { childrenOf } from '../analysis/node/estree-children.mjs';
import { estreeRunsWithCaller } from '../support/flow/sync-callbacks.mjs';
import { callChain, rootNode } from '../support/orm/chains.mjs';

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);
const TRANSACTION = 'transaction';
const OTHER = 'other';
const OPENERS = new Set([
  TRANSACTION,
  '$transaction',
  'transactional',
  'runInTransaction',
  'withTransaction',
  'inTransaction',
  'useTransaction',
]);
const MAX_DEPTH = 4;

function isOpenerCall(call, fn) {
  if (call.type !== 'CallExpression' || !call.arguments.includes(fn)) {
    return false;
  }
  const { callee } = call;
  const name = callee.type === 'MemberExpression' ? callee.property.name : callee.name;
  if (OPENERS.has(name)) {
    return true;
  }
  const opened = name === 'execute' && callee.type === 'MemberExpression';
  return opened && callChain(callee.object).steps.some((step) => step.name === TRANSACTION);
}

export function openerCallback(node) {
  for (const fn of ancestorsOf(node).filter((ancestor) => FUNCTIONS.has(ancestor.type))) {
    if (isOpenerCall(fn.parent, fn)) {
      return fn;
    }
    if (!estreeRunsWithCaller(fn)) {
      return undefined;
    }
  }
  return undefined;
}

export function transactionCallback(node) {
  const fn = openerCallback(node);
  return fn?.params.length > 0 ? fn : undefined;
}

export function clientOrigin(identifier, { context, fn }) {
  const pending = [identifier];
  for (const current of pending) {
    const definition = findVariable(context, current, current.name)?.defs[0];
    if (definition?.type === 'Parameter') {
      return definition.node === fn ? TRANSACTION : 'parameter';
    }
    const init = definition?.type === 'Variable' ? definition.node.init : undefined;
    if (init === undefined || init === null || pending.length > MAX_DEPTH) {
      return OTHER;
    }
    const root = rootNode(init);
    if (root?.type !== 'Identifier') {
      return OTHER;
    }
    pending.push(root);
  }
  return OTHER;
}

export function mentionsTransaction(args, context, fn) {
  const pending = [...args];
  for (const node of pending) {
    if (node.type === 'Identifier' && clientOrigin(node, { context, fn }) === TRANSACTION) {
      return true;
    }
    pending.push(...childrenOf(node, context.sourceCode.visitorKeys));
  }
  return false;
}
