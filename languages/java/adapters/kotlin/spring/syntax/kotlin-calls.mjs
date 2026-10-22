import { kid, kids, textOf } from './kotlin-tree.mjs';

const QUALIFIED = new Set(['DOT_QUALIFIED_EXPRESSION', 'SAFE_ACCESS_EXPRESSION']);

export function walk(root) {
  const nodes = [{ node: root, ancestors: [] }];
  for (const [index, { node, ancestors }] of nodes.entries()) {
    const next = [...ancestors, node];
    nodes.splice(index + 1, 0, ...kids(node).map((child) => ({ node: child, ancestors: next })));
  }
  return nodes;
}

function callOf(source, { node, ancestors }) {
  const parent = ancestors.at(-1);
  if (node.t === 'CALLABLE_REFERENCE_EXPRESSION') {
    const references = kids(node, 'REFERENCE_EXPRESSION');
    return {
      node,
      ancestors,
      name: textOf(source, references.at(-1)),
      receiver: references.length > 1 ? references[0] : undefined,
      arguments: [],
      reference: true,
    };
  }
  if (node.t !== 'CALL_EXPRESSION') {
    return undefined;
  }
  const callee = kids(node)[0];
  const qualified = parent !== undefined && QUALIFIED.has(parent.t) && kids(parent).at(-1) === node;
  return {
    node,
    ancestors,
    name: callee?.t === 'REFERENCE_EXPRESSION' ? textOf(source, callee) : '',
    receiver: qualified ? kids(parent)[0] : undefined,
    arguments: [
      ...kids(kid(node, 'VALUE_ARGUMENT_LIST'), 'VALUE_ARGUMENT'),
      ...kids(node, 'LAMBDA_ARGUMENT'),
    ],
    reference: false,
  };
}

export function callsIn(source, root) {
  return walk(root)
    .map((entry) => callOf(source, entry))
    .filter((call) => call !== undefined);
}

export function receiverName(source, receiver) {
  if (receiver === undefined) {
    return undefined;
  }
  if (receiver.t === 'REFERENCE_EXPRESSION') {
    return textOf(source, receiver);
  }
  const [first, , last] = kids(receiver);
  return receiver.t === 'DOT_QUALIFIED_EXPRESSION' && first?.t === 'THIS_EXPRESSION'
    ? textOf(source, last)
    : undefined;
}

export function isSelfCall(call) {
  return call.receiver === undefined || call.receiver.t === 'THIS_EXPRESSION';
}
