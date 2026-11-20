import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { depthFirst, nameOf } from '../../typed/node-views.mts';
import { TYPE_WRAPPERS, unwrapOf } from '../../typed/syntax-views.mts';

const URL_PARTS = new Set(['href', 'pathname', 'search', 'origin', 'host', 'hostname', 'protocol']);
const ENCODER_TEXT = /encode|escape|searchparams|stringify|querystring|\.toString\(\)/iu;
const PLAIN_NAME = new RegExp(
  '^(?:id|ids|uuid|guid|page|limit|offset|skip|take|count|size|index|idx|i|n|version|timestamp|ts|' +
    'port|year|month|day|total|length|num|number)$|(?:Id|ID|Ids|Count|Index|Page|Limit|Offset|Size|' +
    'Number|Num|Version|Port|Timestamp|Time|Date)$',
  'u',
);

export const CONSTANT_NAME = /^[A-Z][A-Z\d_]*$/u;

function branchesOf(node: TSESTree.Node): TSESTree.Node[] {
  const value = unwrapOf(node, TYPE_WRAPPERS);
  if (value.type === AST_NODE_TYPES.LogicalExpression) {
    return [value.left, value.right];
  }
  return value.type === AST_NODE_TYPES.ConditionalExpression
    ? [value.consequent, value.alternate]
    : [];
}

export function leafNamesOf(node: TSESTree.Node): string[] {
  const names: string[] = [];
  for (const item of depthFirst(node, branchesOf)) {
    const name = branchesOf(item).length === 0 ? lastNameOf(item) : undefined;
    if (name !== undefined) {
      names.push(name);
    }
  }
  return names;
}

export function lastNameOf(node: TSESTree.Node): string | undefined {
  const value = unwrapOf(node, TYPE_WRAPPERS);
  if (value.type === AST_NODE_TYPES.Identifier) {
    return value.name;
  }
  if (value.type === AST_NODE_TYPES.MemberExpression) {
    return value.computed ? undefined : nameOf(value.property);
  }
  return undefined;
}

function isPlainLeaf(value: TSESTree.Node): boolean {
  if (value.type === AST_NODE_TYPES.Literal) {
    return typeof value.value !== 'string' || /^[\w.~-]*$/u.test(value.value);
  }
  if (value.type === AST_NODE_TYPES.MemberExpression && !value.computed) {
    const member = nameOf(value.property) ?? '';
    return (
      URL_PARTS.has(member) ||
      member === 'length' ||
      PLAIN_NAME.test(member) ||
      CONSTANT_NAME.test(member)
    );
  }
  if (value.type === AST_NODE_TYPES.Identifier) {
    return PLAIN_NAME.test(value.name) || CONSTANT_NAME.test(value.name);
  }
  if (value.type === AST_NODE_TYPES.BinaryExpression) {
    return value.operator !== '+';
  }
  return value.type === AST_NODE_TYPES.UnaryExpression;
}

export function isPlainValue(node: TSESTree.Node): boolean {
  const pending = [node];
  for (const item of pending) {
    const value = unwrapOf(item, TYPE_WRAPPERS);
    if (value.type === AST_NODE_TYPES.LogicalExpression) {
      pending.push(value.left, value.right);
    } else if (!isPlainLeaf(value)) {
      return false;
    }
  }
  return true;
}

export function isEncodedText(text: string): boolean {
  return ENCODER_TEXT.test(text);
}

export function quasiText(template: TSESTree.TemplateLiteral, index: number): string {
  return template.quasis[index]?.value.cooked ?? '';
}

export function isUrlConstructor(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Identifier && node.name === 'URL';
}
