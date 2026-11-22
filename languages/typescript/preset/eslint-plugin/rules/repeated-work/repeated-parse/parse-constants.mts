import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import {
  constantInitializer,
  isNode,
  variableNamed,
  type SourceCode,
} from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';

export { localFunctionFor } from '../support/ast-walk.mts';

export const PURE_GLOBALS = new Set([
  'Array',
  'Boolean',
  'Infinity',
  'JSON',
  'Math',
  'NaN',
  'Number',
  'Object',
  'RegExp',
  'String',
  'URL',
  'decodeURIComponent',
  'encodeURIComponent',
  'parseFloat',
  'parseInt',
  'undefined',
]);

export const PURE_GLOBAL_CALLS = new Set([
  'Boolean',
  'Number',
  'String',
  'decodeURIComponent',
  'encodeURIComponent',
  'parseFloat',
  'parseInt',
]);

export const PURE_TEXT_METHODS = new Set([
  'at',
  'charAt',
  'charCodeAt',
  'concat',
  'endsWith',
  'every',
  'exec',
  'filter',
  'find',
  'flat',
  'flatMap',
  'includes',
  'indexOf',
  'join',
  'lastIndexOf',
  'map',
  'match',
  'matchAll',
  'normalize',
  'padEnd',
  'padStart',
  'reduce',
  'repeat',
  'replace',
  'replaceAll',
  'search',
  'slice',
  'some',
  'split',
  'startsWith',
  'substr',
  'substring',
  'test',
  'toLowerCase',
  'toUpperCase',
  'trim',
  'trimEnd',
  'trimStart',
]);

export const PARSING_METHODS = new Set([
  'exec',
  'match',
  'matchAll',
  'replace',
  'replaceAll',
  'search',
  'slice',
  'split',
  'substr',
  'substring',
  'trim',
  'trimEnd',
  'trimStart',
]);

export const CHAIN_METHODS = new Set([
  'filter',
  'flatMap',
  'join',
  'map',
  'replace',
  'replaceAll',
  'slice',
  'split',
  'trim',
  'trimEnd',
  'trimStart',
]);

export const DISALLOWED_NODES = new Set<string>([
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.ImportExpression,
  AST_NODE_TYPES.TaggedTemplateExpression,
  AST_NODE_TYPES.ThisExpression,
  AST_NODE_TYPES.YieldExpression,
]);

export function codeChildren(node: TSESTree.Node): TSESTree.Node[] {
  const skip =
    node.type === AST_NODE_TYPES.MemberExpression && !node.computed
      ? node.property
      : node.type === AST_NODE_TYPES.Property && !node.computed
        ? node.key
        : undefined;
  return Object.entries(node)
    .flatMap(([key, value]): unknown[] =>
      key === 'parent' ? [] : Array.isArray(value) ? value : [value],
    )
    .filter((item): item is TSESTree.Node => isNode(item) && item !== skip);
}

export function isGlobalIdentifier(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  name: string,
): boolean {
  const value = unwrapped(node);
  if (value.type !== AST_NODE_TYPES.Identifier || value.name !== name) {
    return false;
  }
  const variable = variableNamed(sourceCode, value);
  return variable === undefined || variable.defs.length === 0;
}

export function isJsonParseCall(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  const callee = unwrapped(call.callee);
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    memberName(callee) === 'parse' &&
    isGlobalIdentifier(sourceCode, callee.object, 'JSON')
  );
}

export function isRegexNode(
  sourceCode: SourceCode,
  node: TSESTree.Node | undefined,
  seen: ReadonlySet<string> = new Set(),
): boolean {
  if (node === undefined) {
    return false;
  }
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.Literal) {
    return 'regex' in value && value.regex !== undefined;
  }
  if (value.type === AST_NODE_TYPES.NewExpression) {
    return isGlobalIdentifier(sourceCode, value.callee, 'RegExp');
  }
  if (value.type === AST_NODE_TYPES.Identifier && !seen.has(value.name)) {
    const init = constantInitializer(sourceCode, value);
    return init !== undefined && isRegexNode(sourceCode, init, new Set([...seen, value.name]));
  }
  return false;
}
