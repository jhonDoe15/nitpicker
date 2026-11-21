import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';

export type Arm = {
  readonly condition?: TreeNode | undefined;
  readonly conditions?: readonly TreeNode[];
  readonly body: TreeNode;
  readonly start: number | undefined;
  readonly isDefault?: true | false;
  readonly fallsThrough?: true | false;
};

export type BranchGroup = {
  readonly node: TreeNode;
  readonly isStatement: boolean;
  readonly kind: 'if' | 'ternary' | 'switch' | 'when';
  readonly arms: readonly Arm[];
  readonly complete: boolean;
};

export type BranchFinding = {
  readonly identity: string;
  readonly line: number | undefined;
  readonly values: Readonly<Record<string, string>>;
};
