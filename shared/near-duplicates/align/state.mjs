import { KEY_MODES } from '../tree/keys.mjs';
import { sizeOf } from '../tree/nodes.mjs';

const TEMPLATE_FIELDS = ['value', 'binding', 'literal', 'commutes'];

export function createState(cachedKey) {
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

export function sharedNode(state, node, size = node.children.length) {
  state.shared += 1;
  const copy = { kind: node.kind, children: Array.from({ length: size }) };
  for (const field of TEMPLATE_FIELDS.filter((name) => node[name] !== undefined)) {
    copy[field] = node[field];
  }
  return copy;
}

function boundTemplate(state, left) {
  state.shared += 1;
  return {
    kind: 'name',
    binding: 'bound',
    value: String(state.numbers.get(left.value)),
    children: [],
  };
}

export function mapBound(state, [left, right]) {
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

function holeOf(state, kind, [left, right]) {
  const key = `${state.cachedKey(left, KEY_MODES.own)}\u0000${state.cachedKey(right, KEY_MODES.own)}`;
  if (!state.holeKeys.has(key)) {
    const hole = { kind, index: state.holes.length, a: left, b: right, uses: 0, deferred: false };
    state.holeKeys.set(key, hole);
    state.holes.push(hole);
  }
  return state.holeKeys.get(key);
}

export function addHole(state, { kind, pair }) {
  const hole = holeOf(state, kind, pair);
  hole.uses += 1;
  hole.deferred = kind === 'value' && !pair.every((node) => node.kind === 'literal');
  return { kind: 'hole', value: `${kind}:${hole.index}`, children: [] };
}

export function addGap(state, { side, node }) {
  state.gaps.push({ kind: 'gap', side, node, size: sizeOf(node) });
  return { kind: 'gap', children: [] };
}

export function addConflict(state) {
  state.conflicts += 1;
  return { kind: 'conflict', children: [] };
}
