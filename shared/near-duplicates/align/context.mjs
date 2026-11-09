import { isTypeSlot } from '../tree/nodes.mjs';

export const ROOT_CONTEXT = Object.freeze({ write: false, type: false, callee: false });

const WRITE_TARGETS = { declare: 1, parameter: 1, foreach: 1, assign: 0, update: 0 };

export function childContext(node, index) {
  return {
    write: WRITE_TARGETS[node.kind] === index,
    type: isTypeSlot(node, index),
    callee: node.kind === 'call' && index === 0,
  };
}

export function patternContext(context) {
  return { ...context, write: true };
}
