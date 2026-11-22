import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName, numberValue } from '../../collections/costly-forms/repeated-runs.mts';
import { constantInitializer, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';

const TEST_FILE =
  /(?:^|\/)(?:__tests__|tests?|spec|__mocks__|__fixtures__|test-support)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/iu;

const MATERIALIZING_METHODS = new Set(['map', 'filter', 'flatMap']);

export function isTestFile(filename: string): boolean {
  return TEST_FILE.test(filename.replaceAll('\\', '/'));
}

export function constantNumericValue(
  sourceCode: SourceCode,
  node: TSESTree.Node | undefined,
): number | undefined {
  const direct = numberValue(node);
  if (direct !== undefined) {
    return direct;
  }
  const value = node === undefined ? undefined : unwrapped(node);
  if (value?.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  return numberValue(constantInitializer(sourceCode, value));
}

export function calledMethod(
  call: TSESTree.CallExpression,
): { readonly callee: TSESTree.MemberExpression; readonly method: string } | undefined {
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const method = memberName(callee);
  return method === undefined ? undefined : { callee, method };
}

function isBoundedSlice(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  if (call.arguments.length >= 2) {
    return constantNumericValue(sourceCode, call.arguments[1]) !== undefined;
  }
  const single = constantNumericValue(sourceCode, call.arguments[0]);
  return single !== undefined && single < 0;
}

function isBoundedCall(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  seen: ReadonlySet<string>,
): boolean {
  const target = calledMethod(call);
  if (target === undefined) {
    return false;
  }
  if (target.method === 'slice') {
    return (
      isBoundedSlice(sourceCode, call) || isBoundedList(sourceCode, target.callee.object, seen)
    );
  }
  return (
    MATERIALIZING_METHODS.has(target.method) &&
    isBoundedList(sourceCode, target.callee.object, seen)
  );
}

export function isBoundedList(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  seen: ReadonlySet<string> = new Set(),
): boolean {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    return value.elements.every(
      (element) =>
        element === null ||
        element.type !== AST_NODE_TYPES.SpreadElement ||
        isBoundedList(sourceCode, element.argument, seen),
    );
  }
  if (value.type === AST_NODE_TYPES.CallExpression) {
    return isBoundedCall(sourceCode, value, seen);
  }
  if (value.type === AST_NODE_TYPES.Identifier && !seen.has(value.name)) {
    const init = constantInitializer(sourceCode, value);
    return init !== undefined && isBoundedList(sourceCode, init, new Set([...seen, value.name]));
  }
  return false;
}

export function materializedSource(node: TSESTree.Node): TSESTree.Node | undefined {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    const [only] = value.elements;
    return value.elements.length === 1 && only?.type === AST_NODE_TYPES.SpreadElement
      ? only.argument
      : undefined;
  }
  if (value.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const callee = unwrapped(value.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    MATERIALIZING_METHODS.has(memberName(callee) ?? '')
    ? callee.object
    : undefined;
}
