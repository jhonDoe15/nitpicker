import { kid, kids, textOf } from '../kotlin-tree.mjs';

const QUALIFIED = new Set(['DOT_QUALIFIED_EXPRESSION', 'SAFE_ACCESS_EXPRESSION']);

function climb(above, start) {
  let top = start;
  let depth = above.length;
  while (depth > 0 && QUALIFIED.has(above[depth - 1].t) && kids(above[depth - 1])[0] === top) {
    depth -= 1;
    top = above[depth];
  }
  return { top, parent: above[depth - 1] };
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
  const selectors = [];
  for (
    let current = node;
    current !== start && QUALIFIED.has(current.t);
    current = kids(current)[0]
  ) {
    selectors.unshift(selectorText(source, current));
  }
  return selectors;
}

export function selectorsAfter(source, call) {
  const { start, top } = chainOf(call);
  return collect(source, top, start);
}

export function statementOf(call) {
  const { parent } = chainOf(call);
  return parent !== undefined && ['BLOCK', 'BODY'].includes(parent.t);
}
