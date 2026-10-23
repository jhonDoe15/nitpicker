import { ancestorsOf, chainOf } from '../rules/analysis/ancestry.mjs';

const SUITE_NAMES = new Set(['describe', 'suite', 'context']);
const CASE_NAMES = new Set(['it', 'test', 'specify']);
const MODIFIERS = new Set([
  'only',
  'skip',
  'todo',
  'concurrent',
  'sequential',
  'shuffle',
  'each',
  'for',
  'fails',
  'failing',
  'runIf',
  'skipIf',
  'serial',
  'parallel',
  'fixme',
]);

function calleeChain(callee) {
  return chainOf(callee, (current) => {
    if (current.type === 'CallExpression') {
      return current.callee;
    }
    return current.type === 'MemberExpression' ? current.object : undefined;
  });
}

function rootNameOf(callee) {
  const root = calleeChain(callee).at(-1);
  return root?.type === 'Identifier' ? root.name : undefined;
}

function memberNames(callee) {
  return calleeChain(callee)
    .filter((link) => link.type === 'MemberExpression')
    .map((link) => (link.computed ? undefined : link.property.name))
    .toReversed();
}

function testCallShape(node) {
  if (node.type !== 'CallExpression') {
    return undefined;
  }
  const root = rootNameOf(node.callee);
  const names = memberNames(node.callee);
  const isPlaywrightSuite = CASE_NAMES.has(root) && names[0] === 'describe';
  const modifiers = isPlaywrightSuite ? names.slice(1) : names;
  if (!modifiers.every((name) => MODIFIERS.has(name))) {
    return undefined;
  }
  if (isPlaywrightSuite || SUITE_NAMES.has(root)) {
    return 'suite';
  }
  return CASE_NAMES.has(root) ? 'case' : undefined;
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
  return testCallShape(node) === 'suite';
}

export function isCaseCall(node) {
  return testCallShape(node) === 'case';
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
