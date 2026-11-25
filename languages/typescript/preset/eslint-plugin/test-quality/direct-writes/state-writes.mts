import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { variableNamed, type SourceCode } from '../../rules/typed/node-views.mts';
import { memberKeyOf } from '../../rules/typed/syntax-views.mts';

export type StateCall = { readonly key: string; readonly writes: boolean };

export const STORAGE_KEYS: ReadonlySet<string> = new Set(['localStorage', 'sessionStorage']);
export const COOKIE_KEY = 'document.cookie';
export const DIRECTORY_KEY = 'process.cwd';

const GLOBAL_HOLDERS = new Set(['globalThis', 'global', 'window', 'self']);
const STORAGE_WRITES = new Set(['setItem']);
const STORAGE_RESTORES = new Set(['clear', 'removeItem']);

export function isUnshadowed(sourceCode: SourceCode, identifier: TSESTree.Identifier): boolean {
  return (variableNamed(sourceCode, identifier)?.defs.length ?? 0) === 0;
}

function globalName(sourceCode: SourceCode, node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return isUnshadowed(sourceCode, node) ? node.name : undefined;
  }
  if (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.object.type === AST_NODE_TYPES.Identifier &&
    GLOBAL_HOLDERS.has(node.object.name) &&
    isUnshadowed(sourceCode, node.object)
  ) {
    return memberKeyOf(node, '');
  }
  return undefined;
}

function calledMember(call: TSESTree.CallExpression): TSESTree.MemberExpression | undefined {
  return call.callee.type === AST_NODE_TYPES.MemberExpression ? call.callee : undefined;
}

export function stateCall(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): StateCall | undefined {
  const member = calledMember(call);
  if (member === undefined) {
    return undefined;
  }
  const method = memberKeyOf(member, '');
  const owner = globalName(sourceCode, member.object);
  if (owner === 'process' && method === 'chdir') {
    return { key: DIRECTORY_KEY, writes: true };
  }
  if (owner === undefined || !STORAGE_KEYS.has(owner)) {
    return undefined;
  }
  if (STORAGE_WRITES.has(method)) {
    return { key: owner, writes: true };
  }
  return STORAGE_RESTORES.has(method) ? { key: owner, writes: false } : undefined;
}

export function cookieKey(sourceCode: SourceCode, target: TSESTree.Node): string | undefined {
  return target.type === AST_NODE_TYPES.MemberExpression &&
    memberKeyOf(target, '') === 'cookie' &&
    globalName(sourceCode, target.object) === 'document'
    ? COOKIE_KEY
    : undefined;
}

export function savedValueKey(
  sourceCode: SourceCode,
  value: TSESTree.Node,
  keyOf: (target: TSESTree.Node) => string | undefined,
): string | undefined {
  if (value.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const definition = variableNamed(sourceCode, value)?.defs[0];
  const init =
    definition?.node.type === AST_NODE_TYPES.VariableDeclarator
      ? (definition.node.init ?? undefined)
      : undefined;
  return init === undefined ? undefined : keyOf(init);
}

export const PAGE_CALLBACKS: ReadonlySet<string> = new Set([
  'evaluate',
  'execute',
  'executeAsync',
  'evaluateHandle',
  'evaluateOnNewDocument',
  'addInitScript',
  '$eval',
  '$$eval',
  'waitForFunction',
  'exposeFunction',
]);
const EMPTY_MATCHERS = new Set(['toBeNull', 'toBeUndefined', 'toBeFalsy']);
const VALUE_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual', 'toHaveLength']);

export function runsInPage(ancestors: readonly TSESTree.Node[]): boolean {
  return ancestors.some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.CallExpression &&
      ancestor.callee.type === AST_NODE_TYPES.MemberExpression &&
      PAGE_CALLBACKS.has(memberKeyOf(ancestor.callee, '')),
  );
}

function readTarget(node: TSESTree.Node | undefined): TSESTree.Node | undefined {
  if (node?.type === AST_NODE_TYPES.CallExpression) {
    return node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.object : undefined;
  }
  return node?.type === AST_NODE_TYPES.MemberExpression ? node.object : undefined;
}

function storageRead(sourceCode: SourceCode, node: TSESTree.Node | undefined): string | undefined {
  const target = readTarget(node);
  const owner = target === undefined ? undefined : globalName(sourceCode, target);
  return owner !== undefined && STORAGE_KEYS.has(owner) ? owner : undefined;
}

function isEmptyMatch(call: TSESTree.CallExpression, matcher: string): boolean {
  if (EMPTY_MATCHERS.has(matcher)) {
    return true;
  }
  const [value] = call.arguments;
  return (
    VALUE_MATCHERS.has(matcher) &&
    value?.type === AST_NODE_TYPES.Literal &&
    (value.value === 0 || value.value === null)
  );
}

export function assertedEmptyStorage(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): string | undefined {
  const member = calledMember(call);
  const expectation = member?.object;
  if (
    member === undefined ||
    expectation?.type !== AST_NODE_TYPES.CallExpression ||
    expectation.callee.type !== AST_NODE_TYPES.Identifier ||
    expectation.callee.name !== 'expect' ||
    !isEmptyMatch(call, memberKeyOf(member, ''))
  ) {
    return undefined;
  }
  return storageRead(sourceCode, expectation.arguments[0]);
}

export function isCypressSpec(sourceCode: SourceCode): boolean {
  return (
    sourceCode.scopeManager?.globalScope?.through.some(
      (reference) => reference.identifier.name === 'cy',
    ) === true
  );
}
