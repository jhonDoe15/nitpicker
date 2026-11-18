import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../../typed/node-views.mts';

export type Handlers = {
  readonly success: boolean;
  readonly failure: boolean;
};

export type OptionsReading = Handlers | 'unknown';

const NONE: Handlers = { success: false, failure: false };
const failureHandlers = new Set(['onError', 'onSettled', 'throwOnError', 'meta']);

function keyName(property: TSESTree.Property): string | undefined {
  return property.computed ? undefined : (nameOf(property.key) ?? undefined);
}

export function readOptions(node: TSESTree.Node | undefined): OptionsReading {
  if (node === undefined) {
    return NONE;
  }
  if (node.type !== AST_NODE_TYPES.ObjectExpression) {
    return 'unknown';
  }
  if (node.properties.some((property) => property.type !== AST_NODE_TYPES.Property)) {
    return 'unknown';
  }
  const names = node.properties.flatMap((property) =>
    property.type === AST_NODE_TYPES.Property ? (keyName(property) ?? []) : [],
  );
  return {
    success: names.includes('onSuccess'),
    failure: names.some((name) => failureHandlers.has(name)),
  };
}
