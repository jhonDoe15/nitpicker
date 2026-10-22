import { kid, kids, textOf } from '../kotlin-tree.mjs';

const QUALIFIED = new Set(['DOT_QUALIFIED_EXPRESSION', 'SAFE_ACCESS_EXPRESSION']);

function climb(above, start) {
  const chain = [start];
  for (const parent of above.toReversed()) {
    if (!QUALIFIED.has(parent.t) || kids(parent)[0] !== chain.at(-1)) {
      return { top: chain.at(-1), parent };
    }
    chain.push(parent);
  }
  return { top: chain.at(-1), parent: undefined };
}

export function chainOf(call) {
  const enclosing = call.ancestors.at(-1);
  const selector =
    enclosing !== undefined && QUALIFIED.has(enclosing.t) && kids(enclosing).at(-1) === call.node;
  const start = selector ? enclosing : call.node;
  const above = call.ancestors.slice(0, selector ? -1 : undefined);
  return { start, ...climb(above, start) };
}

export function operatorOf(source, node) {
  return textOf(source, kid(node, 'OPERATION_REFERENCE'));
}

export function assignmentsIn(source, nodes) {
  return nodes
    .filter((node) => node.t === 'BINARY_EXPRESSION' && operatorOf(source, node) === '=')
    .map((node) => ({ node, left: kids(node)[0], right: kids(node).at(-1) }));
}

export function assignedName(source, left) {
  if (left?.t === 'REFERENCE_EXPRESSION') {
    return { receiver: undefined, member: textOf(source, left) };
  }
  if (QUALIFIED.has(left?.t)) {
    const [first, , last] = kids(left);
    return { receiver: textOf(source, first), member: textOf(source, last) };
  }
  return { receiver: undefined, member: undefined };
}

function selectorText(source, node) {
  const last = kids(node).at(-1);
  const callee = last?.t === 'CALL_EXPRESSION' ? kids(last)[0] : last;
  return callee?.t === 'REFERENCE_EXPRESSION' ? textOf(source, callee) : '';
}

function collect(source, node, start) {
  const chain = [node];
  for (const current of chain) {
    if (current !== start && QUALIFIED.has(current.t)) {
      chain.push(kids(current)[0]);
    }
  }
  return chain
    .filter((current) => current !== start && QUALIFIED.has(current.t))
    .reverse()
    .map((current) => selectorText(source, current));
}

export function selectorsAfter(source, call) {
  const { start, top } = chainOf(call);
  return collect(source, top, start);
}

export function statementOf(call) {
  const { parent } = chainOf(call);
  return parent !== undefined && ['BLOCK', 'BODY'].includes(parent.t);
}
