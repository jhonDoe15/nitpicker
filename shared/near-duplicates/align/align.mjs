import { depthFirst } from '../../traversal.mjs';
import { createKeyCache } from '../tree/keys.mjs';
import { NONE, categoryOf, isBound } from '../tree/nodes.mjs';
import { ROOT_CONTEXT, childContext, readContext } from './context.mjs';
import { alignedSlots } from './lists.mjs';
import { addConflict, addGap, addHole, createState, mapBound, sharedNode } from './state.mjs';

function sameHead(left, right) {
  return (
    left.kind === right.kind &&
    left.value === right.value &&
    left.literal === right.literal &&
    left.children.length === right.children.length
  );
}

function leaf(template) {
  return { template, next: [] };
}

function descend(state, entry, context = entry.context) {
  const { left, right } = entry;
  const template = sharedNode(state, left);
  const next = left.children.map((child, slot) => ({
    left: child,
    right: right.children[slot],
    context: childContext(left, slot, context),
    into: template,
    slot,
  }));
  return { template, next };
}

function alignName(state, { left, right }) {
  if (isBound(left) && isBound(right)) {
    return mapBound(state, [left, right]);
  }
  if (!isBound(left) && !isBound(right) && left.value === right.value) {
    return sharedNode(state, left);
  }
  return undefined;
}

function alignTarget(state, entry) {
  const { left, right } = entry;
  if (left.kind === 'name' && right.kind === 'name') {
    return leaf(alignName(state, entry) ?? addConflict(state));
  }
  if (!sameHead(left, right)) {
    return leaf(addConflict(state));
  }
  return descend(state, entry, readContext(entry.context));
}

function valueHole(state, entry) {
  return leaf(
    addHole(state, { kind: 'value', pair: [entry.left, entry.right], context: entry.context }),
  );
}

function alignExpression(state, entry) {
  const { left, right } = entry;
  if (left.kind === 'name' && right.kind === 'name') {
    const name = alignName(state, entry);
    return name === undefined ? valueHole(state, entry) : leaf(name);
  }
  if (!sameHead(left, right) || left.kind === 'name') {
    return valueHole(state, entry);
  }
  return descend(state, entry);
}

function alignType(state, entry) {
  const { left, right, context } = entry;
  if (left.kind === 'none' || right.kind === 'none') {
    return leaf(NONE);
  }
  if (left.kind !== 'type' || right.kind !== 'type') {
    return leaf(addConflict(state));
  }
  if (left.value === right.value) {
    return leaf(sharedNode(state, left));
  }
  return leaf(addHole(state, { kind: 'type', pair: [left, right], context }));
}

function alignBlock(state, entry) {
  const template = sharedNode(state, entry.left, 0);
  const next = [];
  for (const slot of alignedSlots(entry.left.children, entry.right.children, state.cachedKey)) {
    if (slot.pair === undefined) {
      template.children.push(addGap(state, slot));
    } else {
      const [left, right] = slot.pair;
      next.push({
        left,
        right,
        context: entry.context,
        into: template,
        slot: template.children.length,
      });
      template.children.push(undefined);
    }
  }
  return { template, next };
}

function alignStructure(state, entry) {
  const { left, right } = entry;
  if (left.kind === 'block' && right.kind === 'block') {
    return alignBlock(state, entry);
  }
  if (
    left.kind === 'parameters' &&
    right.kind === 'parameters' &&
    left.children.length !== right.children.length
  ) {
    return leaf({ kind: 'parameters', children: [] });
  }
  return sameHead(left, right) ? descend(state, entry) : leaf(addConflict(state));
}

function decide(state, entry) {
  const { left, right, context } = entry;
  if (left.kind === 'none' && right.kind === 'none') {
    return leaf(NONE);
  }
  if (context.write) {
    return alignTarget(state, entry);
  }
  if (context.type || categoryOf(left) === 'type' || categoryOf(right) === 'type') {
    return alignType(state, entry);
  }
  if (categoryOf(left) === 'expression' && categoryOf(right) === 'expression') {
    return alignExpression(state, entry);
  }
  return alignStructure(state, entry);
}

function run(state, start) {
  for (const entry of depthFirst(start, (current) => current.next)) {
    const { template, next } = decide(state, entry);
    entry.into.children[entry.slot] = template;
    entry.next = next;
  }
}

export function alignTrees(left, right, cachedKey = createKeyCache()) {
  const state = createState(cachedKey);
  const root = { children: [undefined] };
  run(state, { left, right, context: ROOT_CONTEXT, into: root, slot: 0 });
  return { state, template: root.children[0] };
}

function blockOf(children) {
  return { kind: 'block', children };
}

export function alignLists([left, right], cachedKey = createKeyCache()) {
  const alignment = alignTrees(blockOf(left), blockOf(right), cachedKey);
  alignment.state.shared -= 1;
  return alignment;
}
