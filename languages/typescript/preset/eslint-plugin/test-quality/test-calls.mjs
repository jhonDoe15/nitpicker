import { ancestorsOf, chainOf } from '../rules/analysis/ancestry.mjs';
import {
  findVariable,
  isFunctionNode,
  resolveFunction,
} from '../rules/analysis/constant-resolution.mjs';

const SUITE_NAMES = new Set(['describe', 'suite']);
const CASE_NAMES = new Set(['it', 'test', 'specify', 'xit', 'fit', 'xtest']);
const TEST_MODULES = new Set([
  'vitest',
  'jest',
  'node:test',
  'mocha',
  '@jest/globals',
  '@playwright/test',
]);
const MAX_EXTENSION_DEPTH = 4;
const NOT_TESTS = [
  'step',
  'describe',
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
  'use',
  'extend',
];

function linkOf(current) {
  if (current.type === 'CallExpression') {
    return current.callee;
  }
  if (current.type === 'TaggedTemplateExpression') {
    return current.tag;
  }
  return current.type === 'MemberExpression' ? current.object : undefined;
}

function rootIdentifierOf(callee) {
  const root = chainOf(callee, linkOf).at(-1);
  return root?.type === 'Identifier' ? root : undefined;
}

function rootNameOf(callee) {
  return rootIdentifierOf(callee)?.name;
}

function isRequireOfTestModule(init) {
  return (
    init?.type === 'CallExpression' &&
    init.callee.type === 'Identifier' &&
    init.callee.name === 'require' &&
    TEST_MODULES.has(init.arguments[0]?.value)
  );
}

function isTestSource(definition) {
  if (definition.type === 'ImportBinding') {
    return TEST_MODULES.has(definition.parent.source.value);
  }
  return definition.type === 'Variable' && isRequireOfTestModule(definition.node.init);
}

function extendedFrom(definition) {
  const init =
    definition.type === 'Variable' && definition.parent.kind === 'const'
      ? definition.node.init
      : undefined;
  return init === undefined || init === null ? undefined : rootIdentifierOf(init);
}

function bindingOf(context, identifier, depth) {
  return { identifier, depth, variable: findVariable(context, identifier, identifier.name) };
}

function extensionOf(context, { variable, depth }) {
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  const next =
    depth < MAX_EXTENSION_DEPTH && definition !== undefined && !isTestSource(definition)
      ? extendedFrom(definition)
      : undefined;
  return next === undefined ? undefined : bindingOf(context, next, depth + 1);
}

function isTestBinding(context, identifier) {
  const { identifier: last, variable } = chainOf(bindingOf(context, identifier, 0), (binding) =>
    extensionOf(context, binding),
  ).at(-1);
  if (variable === undefined || variable.defs.length === 0) {
    return CASE_NAMES.has(last.name);
  }
  return isTestSource(variable.defs[0]);
}

export function isTestFunctionChain(node) {
  const root = rootNameOf(node);
  return SUITE_NAMES.has(root) || CASE_NAMES.has(root);
}

export function chainHasProperty(callee, name) {
  return chainOf(callee, linkOf).some(
    (link) => link.type === 'MemberExpression' && !link.computed && link.property.name === name,
  );
}

export function isSuiteCall(node) {
  return node.type === 'CallExpression' && SUITE_NAMES.has(rootNameOf(node.callee));
}

export function isCaseCall(node) {
  return node.type === 'CallExpression' && CASE_NAMES.has(rootNameOf(node.callee));
}

function isInlineFunction(node) {
  return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

export function callbackOf(call) {
  return call.arguments.find(isInlineFunction);
}

function wrappedCallback(argument) {
  return argument.type === 'CallExpression' ? callbackOf(argument) : undefined;
}

function testFunctionOf(context, call) {
  return call.arguments
    .map((argument) =>
      isInlineFunction(argument)
        ? argument
        : (resolveFunction(context, argument) ?? wrappedCallback(argument)),
    )
    .find((fn) => fn !== undefined);
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

export function testCallback(context, call) {
  const root = isCaseCall(call) ? rootIdentifierOf(call.callee) : undefined;
  if (
    root === undefined ||
    call.parent.callee === call ||
    NOT_TESTS.some((name) => chainHasProperty(call.callee, name)) ||
    !isTestBinding(context, root)
  ) {
    return undefined;
  }
  return testFunctionOf(context, call);
}

export function isNestedTest(context, node) {
  if (!isFunctionNode(node)) {
    return false;
  }
  const call = node.parent.type === 'CallExpression' ? node.parent : undefined;
  const outer = call?.parent.type === 'CallExpression' ? call.parent : undefined;
  return (
    (call !== undefined && testCallback(context, call) === node) ||
    (outer !== undefined && testCallback(context, outer) === node)
  );
}
