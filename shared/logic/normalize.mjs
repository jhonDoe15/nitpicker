import { foldTree } from '../traversal.mjs';
import { EXPRESSION_REWRITES } from './rewrites/expressions.mjs';
import { ORDERING_REWRITES } from './rewrites/ordering.mjs';
import { STATEMENT_REWRITES } from './rewrites/statements.mjs';
import { isStatement, key, term, withChildren, withRange } from './terms.mjs';

const MAX_PASSES = 100;
const PASSES = Array.from({ length: MAX_PASSES }, (_, index) => index);

const ON_EXPRESSIONS = [...EXPRESSION_REWRITES, ...ORDERING_REWRITES];

export const REWRITE_NAMES = [
  ...new Set([...ON_EXPRESSIONS, ...STATEMENT_REWRITES].map(({ name }) => name)),
];

export function normalize(node, { booleanContext = false } = {}) {
  const applied = [];
  const wrapped = isStatement(node) && node.kind !== 'block';
  const root = wrapped ? withRange(term('block', undefined, [node]), node.range) : node;
  const normal = toFixedPoint(root, booleanContext, applied);
  const result = wrapped && normal.children.length === 1 ? normal.children[0] : normal;
  return { term: result, key: key(result), rewrites: applied };
}

export function sameCondition(a, b) {
  return normalize(a, { booleanContext: true }).key === normalize(b, { booleanContext: true }).key;
}

function toFixedPoint(root, booleanContext, applied) {
  let current = root;
  for (const pass of PASSES) {
    const before = applied.length;
    current = rewritePass(current, booleanContext, applied);
    if (applied.length === before || pass === MAX_PASSES - 1) {
      break;
    }
  }
  return current;
}

function rewritePass(root, booleanContext, applied) {
  return foldTree(root, booleanContext, {
    expand: (node, context) =>
      node.children.map((child, index) => [child, childContext(node, index, context)]),
    combine: (node, context, children) =>
      rewriteOnce(withChildren(node, children), context, applied),
  });
}

function childContext(node, index, booleanContext) {
  switch (node.kind) {
    case 'if': {
      return index === 0;
    }
    case 'unary': {
      return node.value === '!';
    }
    case 'logical': {
      return node.value !== '??' && booleanContext;
    }
    case 'conditional': {
      return index === 0 || booleanContext;
    }
    default: {
      return false;
    }
  }
}

function rewriteOnce(node, booleanContext, applied) {
  if (node.kind === 'block') {
    const found = firstRewrite(STATEMENT_REWRITES, node, undefined);
    return record(found, node, applied);
  }
  if (isStatement(node)) {
    return node;
  }
  const found = firstRewrite(ON_EXPRESSIONS, node, { booleanContext });
  return record(
    found && { name: found.name, result: { node: found.result, range: node.range } },
    node,
    applied,
  );
}

function firstRewrite(rewrites, node, context) {
  for (const { name, rewrite } of rewrites) {
    const result = rewrite(node, context);
    if (result !== undefined) {
      return { name, result };
    }
  }
  return undefined;
}

function record(found, node, applied) {
  if (found === undefined) {
    return node;
  }
  applied.push({ rewrite: found.name, range: found.result.range });
  return found.result.node;
}
