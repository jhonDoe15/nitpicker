import { EXPRESSION_REWRITES } from '../rewrites/expressions.mjs';
import { findRewrite, STATEMENT_REWRITES } from '../rewrites/statements.mjs';
import { depthFirst } from '../../traversal.mjs';
import {
  foldTerm,
  isBooleanValued,
  isLogical,
  isNot,
  logical,
  term,
  withChildren,
  withRange,
} from '../terms.mjs';

function doubleNegationsIn(root) {
  return foldTerm(root, (node, counts) =>
    counts.reduce((sum, inner) => sum + inner, isNot(node) && isNot(node.children[0]) ? 1 : 0),
  );
}

function doubleNegations(nodes) {
  return nodes.reduce((sum, node) => sum + doubleNegationsIn(node), 0);
}

function addsDoubleNegation(before, after) {
  return doubleNegations(after) > doubleNegations(before);
}

export function sameRange(left, right) {
  return left !== undefined && right !== undefined && left[0] === right[0] && left[1] === right[1];
}

function isElseIf(block) {
  const [only] = block.children;
  return block.children.length === 1 && only.kind === 'if' && sameRange(block.range, only.range);
}

function andOperands(node) {
  return isLogical(node, '&&') ? node.children : [];
}

function leftAssociated(test) {
  const operands = [...depthFirst(test, andOperands)].filter((node) => !isLogical(node, '&&'));
  return operands.reduce((left, right) => logical('&&', [left, right], test.range));
}

function mergedTest(merged) {
  const [test, ...branches] = merged.children;
  return withChildren(merged, [leftAssociated(test), ...branches]);
}

function rewriteNamed(list, name) {
  return list.find((entry) => entry.name === name).rewrite;
}

const EXPRESSION_CHECKS = new Map([
  ['double-negation', (_node, _result, context) => !context.booleanContext],
  ['flipped-equality', () => true],
  ['negated-boolean-literal', () => true],
  [
    'boolean-literal-ternary',
    (node, result) =>
      node.children.slice(1).every(isBooleanValued) && !addsDoubleNegation([node], [result]),
  ],
  ['negated-condition', (node) => node.children[2].kind !== 'conditional'],
]);

const STATEMENT_CHECKS = new Map([
  ['boolean-literal-return', (consumed, result) => !addsDoubleNegation(consumed, [result])],
  ['nested-if-merge', () => true],
  ['negated-condition', ([statement]) => !isElseIf(statement.children[2])],
]);

const RESHAPED = new Map([['nested-if-merge', mergedTest]]);

function checkedExpression([name, accept]) {
  const rewrite = rewriteNamed(EXPRESSION_REWRITES, name);
  return {
    name,
    rewrite: (node, context) => {
      const result = rewrite(node, context);
      return result !== undefined && accept(node, result, context) ? result : undefined;
    },
  };
}

function rewriteAtFirst({ rewrite, accept, reshape }, window) {
  const found = rewrite(withRange(term('block', undefined, window), window[0].range));
  const [first] = found?.node.children ?? window;
  if (first === window[0]) {
    return undefined;
  }
  const count = window.length - found.node.children.length + 1;
  return accept(window.slice(0, count), first)
    ? { count, statements: [reshape(first)] }
    : undefined;
}

function checkedStatement([name, accept]) {
  const step = {
    rewrite: rewriteNamed(STATEMENT_REWRITES, name),
    accept,
    reshape: RESHAPED.get(name) ?? ((statement) => statement),
  };
  return {
    name,
    rewrite: (block) =>
      findRewrite(block, (statement, next) =>
        rewriteAtFirst(step, next === undefined ? [statement] : [statement, next]),
      ),
  };
}

export const SIMPLER_REWRITES = {
  expressions: [...EXPRESSION_CHECKS].map(checkedExpression),
  statements: [...STATEMENT_CHECKS].map(checkedStatement),
};
