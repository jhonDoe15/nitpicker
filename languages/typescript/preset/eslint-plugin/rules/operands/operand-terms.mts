import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { toTerm, type Term } from '../analysis/logic/estree-terms.mts';
import {
  foldTerm,
  isSideEffectFree,
  key,
  normalize,
  print,
} from '../analysis/logic/term-views.mts';
import { chainOf, type SourceCode } from '../typed/node-views.mts';

const TESTED = new Set<string>([
  'IfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
]);
const TRANSPARENT = new Set<string>([
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

function mentionsBinding(term: Term): boolean {
  return foldTerm<boolean>(
    term,
    (node, children) => node.kind === 'name' || node.kind === 'this' || children.some(Boolean),
  );
}

const SAFE_TO_REPEAT = new Set<string>(['/', '%', '**', 'in', 'instanceof']);

function repeatable(term: Term): Term {
  return foldTerm<Term>(term, (node, children) => {
    const isSafe = node.kind === 'binary' && SAFE_TO_REPEAT.has(node.value ?? '');
    return { ...node, children, value: isSafe ? '-' : node.value };
  });
}

/** Whether evaluating `term` twice gives the same value: no writes and no impure calls. */
export function isEffectFree(term: Term): boolean {
  return isSideEffectFree(repeatable(term));
}

export function isStable(term: Term): boolean {
  return isEffectFree(term) && mentionsBinding(term);
}

export function normalTerm(
  node: TSESTree.Node,
  sourceCode: Pick<SourceCode, 'getText'>,
  booleanContext: boolean,
): Term {
  return normalize(toTerm(node, sourceCode), { booleanContext }).term;
}

export function describeTerm(term: Term): { readonly key: string; readonly text: string } {
  return { key: key(term), text: print(term) };
}

function enclosing(node: TSESTree.Node): TSESTree.Node | undefined {
  const parent = node.parent;
  if (parent !== undefined && TRANSPARENT.has(parent.type)) {
    return parent;
  }
  const isChain = parent?.type === AST_NODE_TYPES.LogicalExpression && parent.operator !== '??';
  return isChain ? parent : undefined;
}

export function inBooleanContext(node: TSESTree.Node): boolean {
  const outer = chainOf(node, enclosing).at(-1);
  const parent = outer?.parent;
  if (
    parent !== undefined &&
    (TESTED.has(parent.type) || parent.type === AST_NODE_TYPES.ConditionalExpression)
  ) {
    return 'test' in parent && parent.test === outer;
  }
  return parent?.type === AST_NODE_TYPES.UnaryExpression && parent.operator === '!';
}
