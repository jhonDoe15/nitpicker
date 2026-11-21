import { foldTree } from '../traversal.mts';
import { EXPRESSION_REWRITES } from './rewrites/expressions.mts';
import { ORDERING_REWRITES } from './rewrites/ordering.mts';
import { STATEMENT_REWRITES } from './rewrites/statements.mts';
import { isStatement, key, term, withChildren, withRange } from './terms.mts';
import type { AppliedRewrite, BlockRewrite, RewriteSet, Term } from './typed/term-types.mts';

type NormalizeOptions = Partial<{ booleanContext: boolean }> & { readonly rewrites?: RewriteSet };
type Run = { readonly rewrites: RewriteSet; readonly applied: AppliedRewrite[] };
type Found = { readonly name: string; readonly result: BlockRewrite };

const MAX_PASSES = 100;
const PASSES = Array.from({ length: MAX_PASSES }, (_, index) => index);

const ON_EXPRESSIONS = [...EXPRESSION_REWRITES, ...ORDERING_REWRITES];
const ALL_REWRITES: RewriteSet = { expressions: ON_EXPRESSIONS, statements: STATEMENT_REWRITES };

export const REWRITE_NAMES = [
  ...new Set([...ON_EXPRESSIONS, ...STATEMENT_REWRITES].map(({ name }) => name)),
];

export function normalize(
  node: Term,
  options: NormalizeOptions = {},
): { readonly term: Term; readonly key: string; readonly rewrites: AppliedRewrite[] } {
  const { booleanContext = false, rewrites = ALL_REWRITES } = options;
  const applied: AppliedRewrite[] = [];
  const wrapped = isStatement(node) && node.kind !== 'block';
  const root = wrapped ? withRange(term('block', undefined, [node]), node.range) : node;
  const normal = toFixedPoint(root, { booleanContext, rewrites }, applied);
  const [only] = normal.children;
  const result = wrapped && normal.children.length === 1 && only !== undefined ? only : normal;
  return { term: result, key: key(result), rewrites: applied };
}

export function sameCondition(a: Term, b: Term): boolean {
  return normalize(a, { booleanContext: true }).key === normalize(b, { booleanContext: true }).key;
}

function toFixedPoint(
  root: Term,
  { booleanContext, rewrites }: { readonly booleanContext: boolean; readonly rewrites: RewriteSet },
  applied: AppliedRewrite[],
): Term {
  let current = root;
  for (const pass of PASSES) {
    const before = applied.length;
    current = rewritePass(current, booleanContext, { rewrites, applied });
    if (applied.length === before || pass === MAX_PASSES - 1) {
      break;
    }
  }
  return current;
}

function rewritePass(root: Term, booleanContext: boolean, run: Run): Term {
  return foldTree(root, booleanContext, {
    expand: (node: Term, context: boolean) =>
      node.children.map((child, index): [Term, boolean] => [
        child,
        childContext(node, index, context),
      ]),
    combine: (node: Term, context: boolean, children: Term[]) =>
      rewriteOnce(withChildren(node, children), context, run),
  });
}

function childContext(node: Term, index: number, booleanContext: boolean): boolean {
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

function rewriteOnce(node: Term, booleanContext: boolean, { rewrites, applied }: Run): Term {
  if (node.kind === 'block') {
    const found = firstRewrite(rewrites.statements, node, undefined);
    return record(found, node, applied);
  }
  if (isStatement(node)) {
    return node;
  }
  const found = firstRewrite(rewrites.expressions, node, { booleanContext });
  return record(
    found === undefined
      ? undefined
      : { name: found.name, result: { node: found.result, range: node.range } },
    node,
    applied,
  );
}

function firstRewrite<Context, Result>(
  rewrites: readonly {
    readonly name: string;
    readonly rewrite: (node: Term, context: Context) => Result | undefined;
  }[],
  node: Term,
  context: Context,
): { readonly name: string; readonly result: Result } | undefined {
  for (const { name, rewrite } of rewrites) {
    const result = rewrite(node, context);
    if (result !== undefined) {
      return { name, result };
    }
  }
  return undefined;
}

function record(found: Found | undefined, node: Term, applied: AppliedRewrite[]): Term {
  if (found === undefined) {
    return node;
  }
  applied.push({ rewrite: found.name, range: found.result.range });
  return found.result.node;
}
