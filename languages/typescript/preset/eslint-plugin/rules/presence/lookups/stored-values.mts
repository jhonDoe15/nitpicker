import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { depthFirst, nameOf } from '../../typed/node-views.mts';
import { syntaxChildren } from '../../decided/syntax.mts';
import { unwrap } from './map-lookups.mts';

const NON_EMPTY_CALLS = new Set([
  'emitFile',
  'randomUUID',
  'uuid',
  'nanoid',
  'createHash',
  'digest',
  'hash',
  'toISOString',
  'stringify',
]);

function isNonEmptyText(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.TemplateLiteral
    ? node.quasis.some((quasi) => (quasi.value.cooked ?? '') !== '')
    : node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string' && node.value !== '';
}

function isNonEmptyLeaf(target: TSESTree.Node): boolean {
  if (target.type === AST_NODE_TYPES.Literal) {
    return isNonEmptyText(target) || (typeof target.value === 'number' && target.value !== 0);
  }
  if (target.type === AST_NODE_TYPES.TemplateLiteral) {
    return isNonEmptyText(target);
  }
  if (target.type === AST_NODE_TYPES.BinaryExpression) {
    return target.operator === '+' && (isNonEmptyText(target.left) || isNonEmptyText(target.right));
  }
  if (target.type === AST_NODE_TYPES.CallExpression) {
    const callee =
      target.callee.type === AST_NODE_TYPES.MemberExpression
        ? target.callee.property
        : target.callee;
    return NON_EMPTY_CALLS.has(nameOf(callee) ?? '');
  }
  return false;
}

function isNonEmpty(node: TSESTree.Node): boolean {
  const pending = [node];
  for (const item of pending) {
    const target = unwrap(item);
    if (target.type === AST_NODE_TYPES.ConditionalExpression) {
      pending.push(target.consequent, target.alternate);
    } else if (!isNonEmptyLeaf(target)) {
      return false;
    }
  }
  return true;
}

function assignedTo(name: string, region: readonly TSESTree.Node[]): TSESTree.Node[] {
  return region
    .flatMap((root) => [...depthFirst<TSESTree.Node>(root, syntaxChildren)])
    .flatMap((node) =>
      node.type === AST_NODE_TYPES.AssignmentExpression &&
      node.operator === '=' &&
      node.left.type === AST_NODE_TYPES.Identifier &&
      node.left.name === name
        ? [node.right]
        : [],
    );
}

function possibleValues(value: TSESTree.Node, region: readonly TSESTree.Node[]): TSESTree.Node[] {
  const target = unwrap(value);
  const assigned = target.type === AST_NODE_TYPES.Identifier ? assignedTo(target.name, region) : [];
  return assigned.length > 0 ? assigned : [target];
}

export function onlyStoresNonEmpty(
  stores: readonly TSESTree.CallExpression[],
  region: readonly TSESTree.Node[],
): boolean {
  const values = stores.map((call) => call.arguments[1]);
  return (
    values.length > 0 &&
    values.every(
      (value) =>
        value !== undefined &&
        value.type !== AST_NODE_TYPES.SpreadElement &&
        possibleValues(value, region).every(isNonEmpty),
    )
  );
}
