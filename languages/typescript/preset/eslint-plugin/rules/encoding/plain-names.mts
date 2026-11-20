import type { TSESTree } from '@typescript-eslint/utils';
import { unwrapped } from '../security/security-values.mts';
import { calleeNameOf } from '../typed/syntax-views.mts';

export function plainName(node: TSESTree.Node): string | undefined {
  return calleeNameOf(unwrapped(node));
}
