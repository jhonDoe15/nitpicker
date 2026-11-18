import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, chainOf, nameOf } from '../rules/typed/node-views.mts';
import {
  findVariable,
  isFunctionNode,
  resolveFunction,
  type SourceContext,
} from '../rules/analysis/constant-resolution.mts';

type Context = SourceContext;
type Definition = TSESLint.Scope.Definition;
type Variable = TSESLint.Scope.Variable;
type InlineFunction = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
type TestFunction = InlineFunction | TSESTree.FunctionDeclaration;
type Binding = {
  readonly identifier: TSESTree.Identifier;
  readonly depth: number;
  readonly variable: Variable | undefined;
};

const { DefinitionType } = TSESLint.Scope;
const DESCRIBE = 'describe';
const SUITE = 'suite';

const SUITE_NAMES = new Set([DESCRIBE, SUITE, 'context']);
const CASE_NAMES = new Set(['it', 'test', 'specify', 'xit', 'fit', 'xtest']);
const TEST_MODULES = new Set([
  'vitest',
  'jest',
  'node:test',
  'mocha',
  '@jest/globals',
  '@playwright/test',
]);
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
const MAX_EXTENSION_DEPTH = 4;
const NOT_TESTS = [
  'step',
  DESCRIBE,
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
  'use',
  'extend',
];

function linkOf(current: TSESTree.Node): TSESTree.Node | undefined {
  if (current.type === AST_NODE_TYPES.CallExpression) {
    return current.callee;
  }
  if (current.type === AST_NODE_TYPES.TaggedTemplateExpression) {
    return current.tag;
  }
  return current.type === AST_NODE_TYPES.MemberExpression ? current.object : undefined;
}

function rootIdentifierOf(callee: TSESTree.Node): TSESTree.Identifier | undefined {
  const root = chainOf(callee, linkOf).at(-1);
  return root?.type === AST_NODE_TYPES.Identifier ? root : undefined;
}

function rootNameOf(callee: TSESTree.Node): string | undefined {
  return rootIdentifierOf(callee)?.name;
}

function memberNames(callee: TSESTree.Node): (string | undefined)[] {
  return chainOf(callee, linkOf)
    .filter((link) => link.type === AST_NODE_TYPES.MemberExpression)
    .map((link) => (link.computed ? undefined : nameOf(link.property)))
    .toReversed();
}

function testCallShape(node: TSESTree.Node): typeof SUITE | 'case' | undefined {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const root = rootNameOf(node.callee) ?? '';
  const names = memberNames(node.callee);
  const isPlaywrightSuite = CASE_NAMES.has(root) && names[0] === DESCRIBE;
  const modifiers = isPlaywrightSuite ? names.slice(1) : names;
  if (!modifiers.every((name) => name !== undefined && MODIFIERS.has(name))) {
    return undefined;
  }
  if (isPlaywrightSuite || SUITE_NAMES.has(root)) {
    return SUITE;
  }
  return CASE_NAMES.has(root) ? 'case' : undefined;
}

function isRequireOfTestModule(init: TSESTree.Node | undefined): boolean {
  const first = init?.type === AST_NODE_TYPES.CallExpression ? init.arguments[0] : undefined;
  return (
    init?.type === AST_NODE_TYPES.CallExpression &&
    init.callee.type === AST_NODE_TYPES.Identifier &&
    init.callee.name === 'require' &&
    first?.type === AST_NODE_TYPES.Literal &&
    typeof first.value === 'string' &&
    TEST_MODULES.has(first.value)
  );
}

function isTestSource(definition: Definition): boolean {
  if (definition.type === DefinitionType.ImportBinding) {
    return (
      definition.parent.type === AST_NODE_TYPES.ImportDeclaration &&
      TEST_MODULES.has(definition.parent.source.value)
    );
  }
  return (
    definition.type === DefinitionType.Variable &&
    isRequireOfTestModule(definition.node.init ?? undefined)
  );
}

function extendedFrom(definition: Definition): TSESTree.Identifier | undefined {
  const init =
    definition.type === DefinitionType.Variable && definition.parent.kind === 'const'
      ? definition.node.init
      : undefined;
  return init === undefined || init === null ? undefined : rootIdentifierOf(init);
}

function bindingOf(context: Context, identifier: TSESTree.Identifier, depth: number): Binding {
  return { identifier, depth, variable: findVariable(context, identifier, identifier.name) };
}

function extensionOf(context: Context, { variable, depth }: Binding): Binding | undefined {
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  const next =
    depth < MAX_EXTENSION_DEPTH && definition !== undefined && !isTestSource(definition)
      ? extendedFrom(definition)
      : undefined;
  return next === undefined ? undefined : bindingOf(context, next, depth + 1);
}

function isTestBinding(context: Context, identifier: TSESTree.Identifier): boolean {
  const { identifier: last, variable } =
    chainOf(bindingOf(context, identifier, 0), (binding) => extensionOf(context, binding)).at(-1) ??
    bindingOf(context, identifier, 0);
  const definition = variable?.defs[0];
  if (definition === undefined) {
    return CASE_NAMES.has(last.name);
  }
  return isTestSource(definition);
}

export function isTestFunctionChain(node: TSESTree.Node): boolean {
  const root = rootNameOf(node);
  return root !== undefined && (SUITE_NAMES.has(root) || CASE_NAMES.has(root));
}

export function chainHasProperty(callee: TSESTree.Node, name: string): boolean {
  return chainOf(callee, linkOf).some(
    (link) =>
      link.type === AST_NODE_TYPES.MemberExpression &&
      !link.computed &&
      nameOf(link.property) === name,
  );
}

export function isSuiteCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  return testCallShape(node) === SUITE;
}

export function isCaseCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  return testCallShape(node) === 'case';
}

function isInlineFunction(node: TSESTree.Node): node is InlineFunction {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
}

export function callbackOf(call: TSESTree.CallExpression): InlineFunction | undefined {
  return call.arguments.find(isInlineFunction);
}

function wrappedCallback(argument: TSESTree.Node): InlineFunction | undefined {
  return argument.type === AST_NODE_TYPES.CallExpression ? callbackOf(argument) : undefined;
}

function resolvedTest(context: Context, argument: TSESTree.Node): TestFunction | undefined {
  const resolved = resolveFunction(context, argument);
  return isFunctionNode(resolved) ? resolved : undefined;
}

function testFunctionOf(context: Context, call: TSESTree.CallExpression): TestFunction | undefined {
  return call.arguments
    .map((argument) =>
      isInlineFunction(argument)
        ? argument
        : (resolvedTest(context, argument) ?? wrappedCallback(argument)),
    )
    .find((fn) => fn !== undefined);
}

export function enclosingFunction(node: TSESTree.Node): TSESTree.Node | undefined {
  return ancestorsOf(node).find((ancestor) =>
    [
      AST_NODE_TYPES.ArrowFunctionExpression,
      AST_NODE_TYPES.FunctionExpression,
      AST_NODE_TYPES.FunctionDeclaration,
    ].includes(ancestor.type),
  );
}

export function callbackOwner(fn: TSESTree.Node | undefined): TSESTree.CallExpression | undefined {
  const parent = fn?.parent;
  return parent?.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.some((argument) => argument === fn)
    ? parent
    : undefined;
}

export function testCallback(
  context: Context,
  call: TSESTree.CallExpression,
): TestFunction | undefined {
  const root = isCaseCall(call) ? rootIdentifierOf(call.callee) : undefined;
  if (
    root === undefined ||
    ('callee' in call.parent && call.parent.callee === call) ||
    NOT_TESTS.some((name) => chainHasProperty(call.callee, name)) ||
    !isTestBinding(context, root)
  ) {
    return undefined;
  }
  return testFunctionOf(context, call);
}

export function isNestedTest(context: Context, node: TSESTree.Node): boolean {
  if (!isFunctionNode(node)) {
    return false;
  }
  const call = node.parent.type === AST_NODE_TYPES.CallExpression ? node.parent : undefined;
  const outer = call?.parent.type === AST_NODE_TYPES.CallExpression ? call.parent : undefined;
  return (
    (call !== undefined && testCallback(context, call) === node) ||
    (outer !== undefined && testCallback(context, outer) === node)
  );
}
