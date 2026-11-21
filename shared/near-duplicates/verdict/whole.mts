import { holdsJump } from '../canonical/effects.mts';
import { sizeOf } from '../tree/nodes.mts';
import type { AlignState, Hole, TreeNode } from '../tree/tree-types.mts';
import { THRESHOLDS } from '../thresholds/thresholds.mts';

export type WholeVerdict = {
  readonly verdict?: 'same' | 'parameterizable';
  readonly reason?: string;
};

function covers(shared: number, size: number): boolean {
  return shared * 100 >= THRESHOLDS.minSharedPercent * size;
}

export function controlFlowHole(holes: readonly Pick<Hole, 'a' | 'b'>[]): boolean {
  return holes.some((hole) => holdsJump(hole.a) || holdsJump(hole.b));
}

export function wholeVerdict(
  [left, right]: readonly [TreeNode, TreeNode],
  state: AlignState,
): WholeVerdict {
  if (state.conflicts > 0) {
    return { reason: 'conflict' };
  }
  if (state.gaps.length > 0) {
    return { reason: 'gap' };
  }
  if (state.shared < THRESHOLDS.minSharedNodes) {
    return { reason: 'small' };
  }
  if (!(covers(state.shared, sizeOf(left)) && covers(state.shared, sizeOf(right)))) {
    return { reason: 'coverage' };
  }
  if (state.holes.length === 0) {
    return { verdict: 'same' };
  }
  if (state.holes.length > THRESHOLDS.maxParameters) {
    return { reason: 'holes' };
  }
  if (controlFlowHole(state.holes)) {
    return { reason: 'control-flow' };
  }
  return { verdict: 'parameterizable' };
}
