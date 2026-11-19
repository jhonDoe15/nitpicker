import type { TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../../rules/security/security-values.mts';
import { isDeclared } from '../../support/scope.mts';

export function isGlobalName(context: Context, node: TSESTree.Node, name: string): boolean {
  return !isDeclared(context.sourceCode, node, name);
}
