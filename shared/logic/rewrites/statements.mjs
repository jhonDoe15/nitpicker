import {
  endsInJump,
  isBooleanLiteral,
  isBooleanValued,
  isNot,
  logical,
  not,
  term,
  withRange,
} from '../terms.mjs';

const BLOCK_SCOPED = 'declaration';
const IF_WITHOUT_ELSE = 2;
const IF_WITH_ELSE = 3;

function onlyStatement(block) {
  return block?.kind === 'block' && block.children.length === 1 ? block.children[0] : undefined;
}

function returnedBoolean(block) {
  const statement = block?.kind === 'return' ? block : onlyStatement(block);
  const value = statement?.kind === 'return' ? statement.children[0] : undefined;
  return isBooleanLiteral(value) ? value.value : undefined;
}

function booleanReturn(test, whenTrue, range) {
  if (whenTrue === 'false') {
    return withRange(term('return', undefined, [not(test, range)]), range);
  }
  const value = isBooleanValued(test) ? test : not(not(test, range), range);
  return withRange(term('return', undefined, [value]), range);
}

function spanning(first, last) {
  return first.range && last.range ? [first.range[0], last.range[1]] : first.range;
}

export function findRewrite(block, rewriteAt) {
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

function isIf(statement, length) {
  return statement?.kind === 'if' && statement.children.length === length;
}

function booleanReturns(block) {
  return findRewrite(block, (statement, next) => {
    if (statement.kind !== 'if') {
      return undefined;
    }
    const [test, consequent, alternate] = statement.children;
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

function nestedIfMerge(block) {
  return findRewrite(block, (statement) => {
    const inner = isIf(statement, IF_WITHOUT_ELSE)
      ? onlyStatement(statement.children[1])
      : undefined;
    if (!isIf(inner, IF_WITHOUT_ELSE)) {
      return undefined;
    }
    const test = logical('&&', [statement.children[0], inner.children[0]], statement.range);
    const merged = withRange(term('if', undefined, [test, inner.children[1]]), statement.range);
    return { count: 1, statements: [merged] };
  });
}

function elseAfterJump(block) {
  return findRewrite(block, (statement) => {
    if (!isIf(statement, IF_WITH_ELSE)) {
      return undefined;
    }
    const [test, consequent, alternate] = statement.children;
    if (!endsInJump(consequent) || alternate.children.some(({ kind }) => kind === BLOCK_SCOPED)) {
      return undefined;
    }
    const guard = withRange(term('if', undefined, [test, consequent]), statement.range);
    return { count: 1, statements: [guard, ...alternate.children] };
  });
}

function negatedBranches(block) {
  return findRewrite(block, (statement) => {
    if (!isIf(statement, IF_WITH_ELSE) || !isNot(statement.children[0])) {
      return undefined;
    }
    const [test, consequent, alternate] = statement.children;
    const swapped = term('if', undefined, [test.children[0], alternate, consequent]);
    return { count: 1, statements: [withRange(swapped, statement.range)] };
  });
}

export const STATEMENT_REWRITES = [
  { name: 'boolean-literal-return', rewrite: booleanReturns },
  { name: 'nested-if-merge', rewrite: nestedIfMerge },
  { name: 'negated-condition', rewrite: negatedBranches },
  { name: 'else-after-return', rewrite: elseAfterJump },
];
