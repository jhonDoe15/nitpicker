import { normalize } from '../../../../../../shared/logic/normalize.mjs';
import { print } from '../../../../../../shared/logic/print.mjs';
import { isSideEffectFree } from '../../../../../../shared/logic/purity.mjs';
import { foldTerm, key } from '../../../../../../shared/logic/terms.mjs';
import { chainOf } from '../../../../../../shared/traversal.mjs';
import { toTerm } from '../analysis/logic/estree-terms.mjs';

const TESTED = new Set(['IfStatement', 'WhileStatement', 'DoWhileStatement', 'ForStatement']);
const TRANSPARENT = new Set([
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

function mentionsBinding(term) {
  return foldTerm(
    term,
    (node, children) => node.kind === 'name' || node.kind === 'this' || children.some(Boolean),
  );
}

const SAFE_TO_REPEAT = new Set(['/', '%', '**', 'in', 'instanceof']);

function repeatable(term) {
  return foldTerm(term, (node, children) => {
    const isSafe = node.kind === 'binary' && SAFE_TO_REPEAT.has(node.value);
    return { ...node, children, value: isSafe ? '-' : node.value };
  });
}

/** Whether evaluating `term` twice gives the same value: no writes and no impure calls. */
export function isEffectFree(term) {
  return isSideEffectFree(repeatable(term));
}

export function isStable(term) {
  return isEffectFree(term) && mentionsBinding(term);
}

export function normalTerm(node, sourceCode, booleanContext) {
  return normalize(toTerm(node, sourceCode), { booleanContext }).term;
}

export function describeTerm(term) {
  return { key: key(term), text: print(term) };
}

function enclosing(node) {
  const parent = node.parent;
  if (TRANSPARENT.has(parent?.type)) {
    return parent;
  }
  const isChain = parent?.type === 'LogicalExpression' && parent.operator !== '??';
  return isChain ? parent : undefined;
}

export function inBooleanContext(node) {
  const outer = chainOf(node, enclosing).at(-1);
  const parent = outer.parent;
  if (TESTED.has(parent?.type) || parent?.type === 'ConditionalExpression') {
    return parent.test === outer;
  }
  return parent?.type === 'UnaryExpression' && parent.operator === '!';
}
