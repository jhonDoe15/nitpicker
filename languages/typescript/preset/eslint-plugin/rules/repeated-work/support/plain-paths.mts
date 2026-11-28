import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { lastOf } from '../../../../../../../shared/lists/lists.mts';
import { memberChain } from '../../collections/costly-forms/repeated-runs.mts';

export function isPlainPath(node: TSESTree.Node): boolean {
  const chain = memberChain(node);
  const root = chain.at(-1);
  const steps = chain.slice(0, -1);
  return (
    steps.every((step) => step.type === AST_NODE_TYPES.MemberExpression && !step.computed) &&
    (root?.type === AST_NODE_TYPES.Identifier ||
      (steps.length > 0 && root?.type === AST_NODE_TYPES.ThisExpression))
  );
}

export function pathRoot(node: TSESTree.Node): TSESTree.Node {
  return lastOf(memberChain(node), node);
}
