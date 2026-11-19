import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../../../typed/node-views.mts';
import { unwrapped } from '../../../typed/syntax-views.mts';

export const REPLACERS: ReadonlySet<string> = new Set(['replace', 'replaceAll']);
export const STRING_STEPS: ReadonlySet<string> = new Set([
  'trim',
  'trimStart',
  'trimEnd',
  'toLowerCase',
  'toUpperCase',
  'slice',
  'substring',
  'split',
  'concat',
  'padStart',
  'padEnd',
  'normalize',
]);

type EstreeCall =
  TSESTree.CallExpression | TSESTree.NewExpression | TSESTree.TaggedTemplateExpression;

function isTextCall(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'String';
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const method = nameOf(callee.property) ?? '';
  const stringifies = method === 'stringify' && nameOf(callee.object) === 'JSON';
  return stringifies || method === 'toString' || STRING_STEPS.has(method) || REPLACERS.has(method);
}

function isText(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.Literal) {
    return typeof value.value === 'string';
  }
  return (
    value.type === AST_NODE_TYPES.TemplateLiteral ||
    (value.type === AST_NODE_TYPES.CallExpression && isTextCall(value))
  );
}

export function hasTextReceiver(call: EstreeCall): boolean {
  const callee = call.type === AST_NODE_TYPES.CallExpression ? unwrapped(call.callee) : undefined;
  return callee?.type === AST_NODE_TYPES.MemberExpression && isText(callee.object);
}
