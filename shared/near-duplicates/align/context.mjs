import { isTypeSlot } from '../tree/nodes.mjs';

const READ = Object.freeze({
  write: false,
  type: false,
  conditional: false,
  repeated: false,
  lambda: false,
});

export const ROOT_CONTEXT = READ;

const WRITE_TARGETS = { declare: 1, parameter: 1, foreach: 1, assign: 0, update: 0 };

const CONDITIONAL_FROM = { if: 1, conditional: 1 };

const FOREACH_BODY = 3;

const SHORT_CIRCUIT = new Set(['&&', '||', '??']);

function flags(node, index) {
  if (node.kind === 'lambda') {
    return { lambda: true };
  }
  if (node.kind === 'while' || node.kind === 'do' || node.kind === 'for') {
    return { repeated: true, conditional: true };
  }
  if (node.kind === 'foreach' && index === FOREACH_BODY) {
    return { repeated: true, conditional: true };
  }
  if (node.kind === 'binary' && SHORT_CIRCUIT.has(node.value) && index === 1) {
    return { conditional: true };
  }
  if (node.kind === 'statement' || index >= (CONDITIONAL_FROM[node.kind] ?? Infinity)) {
    return { conditional: true };
  }
  return {};
}

export function childContext(node, index, context) {
  const extra = flags(node, index);
  return {
    write: WRITE_TARGETS[node.kind] === index,
    type: isTypeSlot(node, index),
    conditional: context.conditional || extra.conditional === true,
    repeated: context.repeated || extra.repeated === true,
    lambda: context.lambda || extra.lambda === true,
  };
}

export function readContext(context) {
  return { ...context, write: false, type: false };
}
