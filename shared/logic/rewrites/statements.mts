import {
  endsInJump,
  isBooleanLiteral,
  isBooleanValued,
  isNot,
  logical,
  not,
  term,
  withRange,
} from '../terms.mts';
import { pairOf, tripleOf } from '../typed/term-parts.mts';
import type { BlockRewrite, Range, StatementRewrite, Term } from '../typed/term-types.mts';

type Replacement = { readonly count: number; readonly statements: Term[] };

const BLOCK_SCOPED = 'declaration';
const IF_WITHOUT_ELSE = 2;
const IF_WITH_ELSE = 3;

function onlyStatement(block: Term | undefined): Term | undefined {
  return block?.kind === 'block' && block.children.length === 1 ? block.children[0] : undefined;
}

function returnedBoolean(block: Term | undefined): string | undefined {
  const statement = block?.kind === 'return' ? block : onlyStatement(block);
  const value = statement?.kind === 'return' ? statement.children[0] : undefined;
  return value !== undefined && isBooleanLiteral(value) ? value.value : undefined;
}

function booleanReturn(test: Term, whenTrue: string, range: Range | undefined): Term {
  if (whenTrue === 'false') {
    return withRange(term('return', undefined, [not(test, range)]), range);
  }
  const value = isBooleanValued(test) ? test : not(not(test, range), range);
  return withRange(term('return', undefined, [value]), range);
}

function spanning(first: Term, last: Term | undefined): Range | undefined {
  return first.range && last?.range ? [first.range[0], last.range[1]] : first.range;
}

export function findRewrite(
  block: Term,
  rewriteAt: (statement: Term, next: Term | undefined) => Replacement | undefined,
): BlockRewrite | undefined {
  for (const [index, statement] of block.children.entries()) {
    const replacement = rewriteAt(statement, block.children[index + 1]);
    if (replacement !== undefined) {
      const last = block.children[index + replacement.count - 1];
      const children = block.children.toSpliced(
        index,
        replacement.count,
        ...replacement.statements,
      );
      return { node: { ...block, children }, range: spanning(statement, last) };
    }
  }
  return undefined;
}

function isIf(statement: Term | undefined, length: number): boolean {
  return statement?.kind === 'if' && statement.children.length === length;
}

function booleanReturns(block: Term): BlockRewrite | undefined {
  return findRewrite(block, (statement, next) => {
    const [test, consequent, alternate] = statement.children;
    if (statement.kind !== 'if' || test === undefined) {
      return undefined;
    }
    const whenTrue = returnedBoolean(consequent);
    const whenFalse = returnedBoolean(alternate ?? next);
    if (whenTrue === undefined || whenFalse === undefined || whenTrue === whenFalse) {
      return undefined;
    }
    const count = alternate === undefined ? 2 : 1;
    const range = count === 2 ? spanning(statement, next) : statement.range;
    return { count, statements: [booleanReturn(test, whenTrue, range)] };
  });
}

function nestedIfMerge(block: Term): BlockRewrite | undefined {
  return findRewrite(block, (statement) => {
    const inner = isIf(statement, IF_WITHOUT_ELSE)
      ? onlyStatement(statement.children[1])
      : undefined;
    const outerParts = pairOf(statement);
    const innerParts = inner === undefined ? undefined : pairOf(inner);
    if (!isIf(inner, IF_WITHOUT_ELSE) || outerParts === undefined || innerParts === undefined) {
      return undefined;
    }
    const test = logical('&&', [outerParts[0], innerParts[0]], statement.range);
    const merged = withRange(term('if', undefined, [test, innerParts[1]]), statement.range);
    return { count: 1, statements: [merged] };
  });
}

function elseAfterJump(block: Term): BlockRewrite | undefined {
  return findRewrite(block, (statement) => {
    const parts = tripleOf(statement);
    if (!isIf(statement, IF_WITH_ELSE) || parts === undefined) {
      return undefined;
    }
    const [test, consequent, alternate] = parts;
    if (!endsInJump(consequent) || alternate.children.some(({ kind }) => kind === BLOCK_SCOPED)) {
      return undefined;
    }
    const guard = withRange(term('if', undefined, [test, consequent]), statement.range);
    return { count: 1, statements: [guard, ...alternate.children] };
  });
}

function negatedBranches(block: Term): BlockRewrite | undefined {
  return findRewrite(block, (statement) => {
    const parts = tripleOf(statement);
    if (!isIf(statement, IF_WITH_ELSE) || parts === undefined || !isNot(statement.children[0])) {
      return undefined;
    }
    const [test, consequent, alternate] = parts;
    const negated = test.children[0];
    if (negated === undefined) {
      return undefined;
    }
    const swapped = term('if', undefined, [negated, alternate, consequent]);
    return { count: 1, statements: [withRange(swapped, statement.range)] };
  });
}

export const STATEMENT_REWRITES: readonly StatementRewrite[] = [
  { name: 'boolean-literal-return', rewrite: booleanReturns },
  { name: 'nested-if-merge', rewrite: nestedIfMerge },
  { name: 'negated-condition', rewrite: negatedBranches },
  { name: 'else-after-return', rewrite: elseAfterJump },
];
