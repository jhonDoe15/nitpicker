import type { TSESTree } from '@typescript-eslint/utils';

export function isTestOf(node: TSESTree.Node, parentTypes: ReadonlySet<string>): boolean {
  const { parent } = node;
  return (
    parent !== undefined && parentTypes.has(parent.type) && 'test' in parent && parent.test === node
  );
}
