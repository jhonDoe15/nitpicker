import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../typed/node-views.mts';

const FASTIFY_OPTIONS = new Set([
  'preHandler',
  'onRequest',
  'preValidation',
  'preParsing',
  'beforeHandler',
]);

export function middlewareName(node: TSESTree.Node): string | undefined {
  const pending = [node];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.Identifier) {
      return current.name;
    }
    if (current.type === AST_NODE_TYPES.MemberExpression && !current.computed) {
      return nameOf(current.property);
    }
    if (current.type === AST_NODE_TYPES.CallExpression) {
      pending.push(current.callee);
    }
  }
  return undefined;
}

function nestedItems(item: TSESTree.Node): TSESTree.Node[] | undefined {
  if (item.type === AST_NODE_TYPES.ArrayExpression) {
    return item.elements.filter((element) => element !== null);
  }
  if (item.type === AST_NODE_TYPES.ObjectExpression) {
    return item.properties
      .filter(
        (property): property is TSESTree.Property =>
          property.type === AST_NODE_TYPES.Property &&
          FASTIFY_OPTIONS.has(nameOf(property.key) ?? ''),
      )
      .map((property) => property.value);
  }
  return undefined;
}

export function middlewareIn(arg: TSESTree.Node): string[] {
  const names: string[] = [];
  const pending = [arg];
  for (const item of pending) {
    const nested = nestedItems(item);
    const name = nested === undefined ? middlewareName(item) : undefined;
    pending.push(...(nested ?? []));
    if (name !== undefined) {
      names.push(name);
    }
  }
  return names;
}
