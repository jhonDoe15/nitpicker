import { holdsJump } from '../canonical/effects.mjs';
import { sizeOf } from '../tree/nodes.mjs';
import { THRESHOLDS } from '../thresholds.mjs';

function covers(shared, size) {
  return shared * 100 >= THRESHOLDS.minSharedPercent * size;
}

export function controlFlowHole(holes) {
  return holes.some((hole) => holdsJump(hole.a) || holdsJump(hole.b));
}

export function wholeVerdict([left, right], state) {
  if (state.conflicts > 0) {
    return { reason: 'conflict' };
  }
  if (state.gaps.length > 0) {
    return { reason: 'gap' };
  }
  if (state.shared < THRESHOLDS.minSharedNodes) {
    return { reason: 'small' };
  }
  if (!covers(state.shared, sizeOf(left)) || !covers(state.shared, sizeOf(right))) {
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
