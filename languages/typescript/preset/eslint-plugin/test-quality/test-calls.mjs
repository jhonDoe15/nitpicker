import { ancestorsOf, chainOf } from '../rules/analysis/ancestry.mjs';

const SUITE_NAMES = new Set(['describe', 'suite']);
const CASE_NAMES = new Set(['it', 'test']);

function rootNameOf(callee) {
  const root = chainOf(callee, (current) => {
    if (current.type === 'CallExpression') {
      return current.callee;
    }
    return current.type === 'MemberExpression' ? current.object : undefined;
  }).at(-1);
  return root?.type === 'Identifier' ? root.name : undefined;
}

export function isTestFunctionChain(node) {
  const root = rootNameOf(node);
  return SUITE_NAMES.has(root) || CASE_NAMES.has(root);
}

export function chainHasProperty(callee, name) {
  return chainOf(callee, (current) => {
    if (current.type === 'CallExpression') {
      return current.callee;
    }
    return current.type === 'MemberExpression' ? current.object : undefined;
  }).some(
    (link) => link.type === 'MemberExpression' && !link.computed && link.property.name === name,
  );
}

export function isSuiteCall(node) {
  return node.type === 'CallExpression' && SUITE_NAMES.has(rootNameOf(node.callee));
}

export function isCaseCall(node) {
  return node.type === 'CallExpression' && CASE_NAMES.has(rootNameOf(node.callee));
}

export function callbackOf(call) {
  return call.arguments.find(
    (argument) =>
      argument.type === 'ArrowFunctionExpression' || argument.type === 'FunctionExpression',
  );
}

export function enclosingFunction(node) {
  return ancestorsOf(node).find((ancestor) =>
    ['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(
      ancestor.type,
    ),
  );
}

export function callbackOwner(fn) {
  const parent = fn?.parent;
  return parent?.type === 'CallExpression' && parent.arguments.includes(fn) ? parent : undefined;
}
