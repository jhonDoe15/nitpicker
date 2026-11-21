import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, type SourceCode } from '../../rules/typed/node-views.mts';
import { memberKeyOf } from '../../rules/typed/syntax-views.mts';
import { COOKIE_KEY, DIRECTORY_KEY, PAGE_CALLBACKS, STORAGE_KEYS } from './state-writes.mts';

const NAVIGATOR_PREFIX = 'navigator.';
const STUBBING_CALLS = new Set(['stubGlobal', 'spyOn', 'replaceProperty']);
type Placed = { readonly node: TSESTree.Node; readonly key: string };

const FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);

export function isPutBackByLaterWrite(key: string): boolean {
  return key === DIRECTORY_KEY || key === COOKIE_KEY || key.startsWith(NAVIGATOR_PREFIX);
}

function literalText(node: TSESTree.Node | undefined): string | undefined {
  return node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string'
    ? node.value
    : undefined;
}

export function stubbedName(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    !STUBBING_CALLS.has(memberKeyOf(callee, ''))
  ) {
    return undefined;
  }
  const [first, second] = call.arguments;
  if (memberKeyOf(callee, '') === 'stubGlobal') {
    return literalText(first);
  }
  const owner = first?.type === AST_NODE_TYPES.Identifier ? first.name : undefined;
  const member = literalText(second);
  return owner === undefined || member === undefined ? undefined : `${owner}.${member}`;
}

export function isStubbedAway(key: string, stubbed: ReadonlySet<string>): boolean {
  if (STORAGE_KEYS.has(key)) {
    return stubbed.has(key) || stubbed.has(`window.${key}`);
  }
  if (key === COOKIE_KEY) {
    return stubbed.has('document') || stubbed.has(COOKIE_KEY);
  }
  if (key === DIRECTORY_KEY) {
    return stubbed.has('process.chdir');
  }
  return key.startsWith(NAVIGATOR_PREFIX) && (stubbed.has('navigator') || stubbed.has(key));
}

function isPageCall(node: TSESTree.Node | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    PAGE_CALLBACKS.has(memberKeyOf(node.callee, ''))
  );
}

export function isNamedPageFunction(
  sourceCode: SourceCode,
  ancestors: readonly TSESTree.Node[],
): boolean {
  return ancestors.some((ancestor) => {
    const holder =
      ancestor.type === AST_NODE_TYPES.FunctionDeclaration || !FUNCTIONS.has(ancestor.type)
        ? undefined
        : ancestor.parent;
    return (
      holder?.type === AST_NODE_TYPES.VariableDeclarator &&
      sourceCode
        .getDeclaredVariables(holder)
        .some((variable) =>
          variable.references.some((reference) => isPageCall(reference.identifier.parent)),
        )
    );
  });
}

const EACH_HOOKS = new Set(['beforeEach', 'afterEach']);

export const CLEARING_HOOKS = new Set([...EACH_HOOKS, 'afterAll', 'onTestFinished']);

export function enclosingFunctionName(node: TSESTree.Node): string | undefined {
  const owner = ancestorsOf(node).find((ancestor) => FUNCTIONS.has(ancestor.type));
  if (owner?.type === AST_NODE_TYPES.FunctionDeclaration) {
    return owner.id?.name;
  }
  const holder = owner?.parent;
  return holder?.type === AST_NODE_TYPES.VariableDeclarator &&
    holder.id.type === AST_NODE_TYPES.Identifier
    ? holder.id.name
    : undefined;
}

export function inEachHook(node: TSESTree.Node): boolean {
  return ancestorsOf(node).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.CallExpression &&
      ancestor.callee.type === AST_NODE_TYPES.Identifier &&
      EACH_HOOKS.has(ancestor.callee.name),
  );
}

export function innermostFunction(node: TSESTree.Node): TSESTree.Node | undefined {
  return ancestorsOf(node).find((ancestor) => FUNCTIONS.has(ancestor.type));
}

export function restoresLater(write: Placed, restores: readonly Placed[]): boolean {
  const owner = innermostFunction(write.node);
  return restores.some(
    (restore) =>
      restore.key === write.key &&
      restore.node.range[0] > write.node.range[0] &&
      innermostFunction(restore.node) === owner,
  );
}
