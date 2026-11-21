import { isTypeSlot } from '../tree/nodes.mts';
import type { TreeNode } from '../tree/tree-types.mts';

export type AlignContext = {
  readonly write: boolean;
  readonly type: boolean;
  readonly callee: boolean;
};

export const ROOT_CONTEXT: AlignContext = Object.freeze({
  write: false,
  type: false,
  callee: false,
});

const WRITE_TARGETS: Readonly<Record<string, number>> = {
  declare: 1,
  parameter: 1,
  foreach: 1,
  assign: 0,
  update: 0,
};

export function childContext(node: TreeNode, index: number): AlignContext {
  return {
    write: WRITE_TARGETS[node.kind] === index,
    type: isTypeSlot(node, index),
    callee: node.kind === 'call' && index === 0,
  };
}

export function patternContext(context: AlignContext): AlignContext {
  return { ...context, write: true };
}
