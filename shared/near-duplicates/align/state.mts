import { KEY_MODES } from '../tree/keys.mts';
import { NONE, sizeOf } from '../tree/nodes.mts';
import type {
  AlignState,
  Hole,
  HoleKind,
  KeyCache,
  Side,
  Template,
  TreeNode,
} from '../tree/tree-types.mts';

export function createState(cachedKey: KeyCache): AlignState {
  return {
    cachedKey,
    forward: new Map(),
    backward: new Map(),
    numbers: new Map(),
    renames: [],
    holes: [],
    holeKeys: new Map(),
    gaps: [],
    conflicts: 0,
    shared: 0,
  };
}

export function sharedNode(
  state: AlignState,
  node: TreeNode,
  size: number = node.children.length,
): Template {
  state.shared += 1;
  return {
    kind: node.kind,
    children: Array.from({ length: size }, () => NONE),
    ...(node.value === undefined ? {} : { value: node.value }),
    ...(node.binding === undefined ? {} : { binding: node.binding }),
    ...(node.literal === undefined ? {} : { literal: node.literal }),
    ...(node.commutes === undefined ? {} : { commutes: node.commutes }),
  };
}

function boundTemplate(state: AlignState, left: TreeNode): TreeNode {
  state.shared += 1;
  return {
    kind: 'name',
    binding: 'bound',
    value: String(state.numbers.get(left.value)),
    children: [],
  };
}

export function mapBound(
  state: AlignState,
  [left, right]: readonly [TreeNode, TreeNode],
): TreeNode | undefined {
  const forward = state.forward.get(left.value);
  const backward = state.backward.get(right.value);
  if (forward !== undefined || backward !== undefined) {
    return forward === right.value && backward === left.value
      ? boundTemplate(state, left)
      : undefined;
  }
  state.forward.set(left.value, right.value);
  state.backward.set(right.value, left.value);
  state.numbers.set(left.value, state.numbers.size);
  if ((left.text ?? left.value) !== (right.text ?? right.value)) {
    state.renames.push({ kind: 'rename', a: left, b: right });
  }
  return boundTemplate(state, left);
}

function holeOf(state: AlignState, kind: HoleKind, [left, right]: readonly [TreeNode, TreeNode]) {
  const key = JSON.stringify([
    state.cachedKey(left, KEY_MODES.own),
    state.cachedKey(right, KEY_MODES.own),
  ]);
  const known = state.holeKeys.get(key);
  if (known !== undefined) {
    return known;
  }
  const hole: Hole = {
    kind,
    index: state.holes.length,
    a: left,
    b: right,
    uses: 0,
    deferred: false,
  };
  state.holeKeys.set(key, hole);
  state.holes.push(hole);
  return hole;
}

export function addHole(
  state: AlignState,
  { kind, pair }: { readonly kind: HoleKind; readonly pair: readonly [TreeNode, TreeNode] },
): TreeNode {
  const hole = holeOf(state, kind, pair);
  hole.uses += 1;
  hole.deferred = kind === 'value' && !pair.every((node) => node.kind === 'literal');
  return { kind: 'hole', value: `${kind}:${String(hole.index)}`, children: [] };
}

export function addGap(
  state: AlignState,
  { side, node }: { readonly side: Side; readonly node: TreeNode },
): TreeNode {
  state.gaps.push({ kind: 'gap', side, node, size: sizeOf(node) });
  return { kind: 'gap', children: [] };
}

export function addConflict(state: AlignState): TreeNode {
  state.conflicts += 1;
  return { kind: 'conflict', children: [] };
}
