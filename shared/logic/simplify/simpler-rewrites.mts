import { EXPRESSION_REWRITES } from '../rewrites/expressions.mts';
import { findRewrite, STATEMENT_REWRITES } from '../rewrites/statements.mts';
import { depthFirst } from '../../traversal.mts';
import {
  foldTerm,
  isBooleanValued,
  isLogical,
  isNot,
  logical,
  term,
  withChildren,
  withRange,
} from '../terms.mts';
import type {
  ExpressionRewrite,
  Range,
  RewriteContext,
  RewriteSet,
  StatementRewrite,
  Term,
} from '../typed/term-types.mts';

type ExpressionAccept = (node: Term, result: Term, context: RewriteContext) => boolean;
type StatementAccept = (consumed: Term[], result: Term) => boolean;
type StatementStep = {
  readonly rewrite: StatementRewrite['rewrite'];
  readonly accept: StatementAccept;
  readonly reshape: (statement: Term) => Term;
};

function doubleNegationsIn(root: Term): number {
  return foldTerm<number>(root, (node, counts) =>
    counts.reduce((sum, inner) => sum + inner, isNot(node) && isNot(node.children[0]) ? 1 : 0),
  );
}

function doubleNegations(nodes: readonly Term[]): number {
  return nodes.reduce((sum, node) => sum + doubleNegationsIn(node), 0);
}

function addsDoubleNegation(before: readonly Term[], after: readonly Term[]): boolean {
  return doubleNegations(after) > doubleNegations(before);
}

export function sameRange(left: Range | undefined, right: Range | undefined): boolean {
  return left !== undefined && right !== undefined && left[0] === right[0] && left[1] === right[1];
}

function isElseIf(block: Term | undefined): boolean {
  const [only] = block?.children ?? [];
  return (
    block !== undefined &&
    block.children.length === 1 &&
    only?.kind === 'if' &&
    sameRange(block.range, only.range)
  );
}

function andOperands(node: Term): Term[] {
  return isLogical(node, '&&') ? node.children : [];
}

function leftAssociated(test: Term): Term {
  const operands: Term[] = [...depthFirst(test, andOperands)].filter(
    (node) => !isLogical(node, '&&'),
  );
  return operands.reduce((left, right) => logical('&&', [left, right], test.range));
}

function mergedTest(merged: Term): Term {
  const [test, ...branches] = merged.children;
  return test === undefined ? merged : withChildren(merged, [leftAssociated(test), ...branches]);
}

function rewriteNamed<Rewrite>(
  list: readonly { readonly name: string; readonly rewrite: Rewrite }[],
  name: string,
): Rewrite {
  const entry = list.find((candidate) => candidate.name === name);
  if (entry === undefined) {
    throw new Error(`No rewrite named ${name}`);
  }
  return entry.rewrite;
}

const EXPRESSION_CHECKS = new Map<string, ExpressionAccept>([
  ['double-negation', (_node, _result, context) => !context.booleanContext],
  ['flipped-equality', () => true],
  ['negated-boolean-literal', () => true],
  [
    'boolean-literal-ternary',
    (node, result) =>
      node.children.slice(1).every(isBooleanValued) && !addsDoubleNegation([node], [result]),
  ],
  [
    'negated-condition',
    (node) => node.children.slice(1).every(({ kind }) => kind !== 'conditional'),
  ],
]);

const STATEMENT_CHECKS = new Map<string, StatementAccept>([
  ['boolean-literal-return', (consumed, result) => !addsDoubleNegation(consumed, [result])],
  ['nested-if-merge', () => true],
  [
    'negated-condition',
    ([statement]) => statement !== undefined && !isElseIf(statement.children[2]),
  ],
]);

const RESHAPED = new Map<string, (statement: Term) => Term>([['nested-if-merge', mergedTest]]);

function checkedExpression([name, accept]: [string, ExpressionAccept]): ExpressionRewrite {
  const rewrite = rewriteNamed(EXPRESSION_REWRITES, name);
  return {
    name,
    rewrite: (node, context) => {
      const result = rewrite(node, context);
      return result !== undefined && accept(node, result, context) ? result : undefined;
    },
  };
}

function rewriteAtFirst(
  { rewrite, accept, reshape }: StatementStep,
  window: Term[],
): { readonly count: number; readonly statements: Term[] } | undefined {
  const found = rewrite(withRange(term('block', undefined, window), window[0]?.range));
  const [first] = found?.node.children ?? window;
  if (found === undefined || first === undefined || first === window[0]) {
    return undefined;
  }
  const count = window.length - found.node.children.length + 1;
  return accept(window.slice(0, count), first)
    ? { count, statements: [reshape(first)] }
    : undefined;
}

function checkedStatement([name, accept]: [string, StatementAccept]): StatementRewrite {
  const step: StatementStep = {
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

export const SIMPLER_REWRITES: RewriteSet = {
  expressions: [...EXPRESSION_CHECKS].map(checkedExpression),
  statements: [...STATEMENT_CHECKS].map(checkedStatement),
};
