import { foldTree } from '../traversal.mts';
import type { Range, Term } from './typed/term-types.mts';

const EQUALITY_FLIPS = new Map([
  ['==', '!='],
  ['!=', '=='],
  ['===', '!=='],
  ['!==', '==='],
]);

const STATEMENT_KINDS = new Set([
  'block',
  'if',
  'return',
  'throw',
  'break',
  'continue',
  'expression',
  'declaration',
  'statement',
]);

const COMPARISONS = new Set<string | undefined>(['<', '<=', '>', '>=']);
const JUMPS = new Set(['return', 'throw', 'break', 'continue']);

export function term(kind: string, value?: string, children: Term[] = []): Term {
  return { kind, value, children, range: undefined };
}

export function withRange(node: Term, range: Range | undefined): Term {
  return { ...node, range };
}

export function rangeKey(range: Range): string {
  return `${String(range[0])}:${String(range[1])}`;
}

export function literal(value: string, range: Range | undefined): Term {
  return withRange(term('literal', value), range);
}

export function not(operand: Term, range: Range | undefined = operand.range): Term {
  return withRange(term('unary', '!', [operand]), range);
}

export function logical(
  operator: string | undefined,
  operands: Term[],
  range: Range | undefined = operands[0]?.range,
): Term {
  return withRange(term('logical', operator, operands), range);
}

export function sameAnswer(first: Term, second: Term): Term {
  return logical('||', [logical('&&', [first, second]), logical('&&', [not(first), not(second)])]);
}

export function withChildren(node: Term, children: Term[]): Term {
  return children.every((child, index) => child === node.children[index])
    ? node
    : { ...node, children };
}

export function foldTerm<Result>(
  root: Term,
  combine: (node: Term, results: Result[]) => Result,
): Result {
  return foldTree(root, undefined, {
    expand: (node: Term) => node.children.map((child): [Term, undefined] => [child, undefined]),
    combine: (node: Term, _context: undefined, results: Result[]) => combine(node, results),
  });
}

export function key(root: Term): string {
  return foldTerm<string>(root, (node, children) => {
    const head =
      node.value === undefined ? node.kind : `${node.kind}:${JSON.stringify(node.value)}`;
    return children.length === 0 ? head : `(${head} ${children.join(' ')})`;
  });
}

export function isStatement(node: Term): boolean {
  return STATEMENT_KINDS.has(node.kind);
}

export function isComparison(node: Term | undefined): boolean {
  return node?.kind === 'binary' && COMPARISONS.has(node.value);
}

export function isEquality(node: Term | undefined): boolean {
  return node?.kind === 'binary' && node.value !== undefined && EQUALITY_FLIPS.has(node.value);
}

export function flippedEquality(operator: string | undefined): string | undefined {
  return operator === undefined ? undefined : EQUALITY_FLIPS.get(operator);
}

export function isBooleanLiteral(node: Term | undefined, value?: string): boolean {
  return (
    node?.kind === 'literal' &&
    (value === undefined ? node.value === 'true' || node.value === 'false' : node.value === value)
  );
}

export function isNot(node: Term | undefined): boolean {
  return node?.kind === 'unary' && node.value === '!';
}

export function isLogical(node: Term | undefined, operator: string | undefined): boolean {
  return node?.kind === 'logical' && node.value === operator;
}

export function isBooleanValued(root: Term): boolean {
  return foldTerm<boolean>(root, (node, children) => {
    if (node.boolean === true || isBooleanLiteral(node) || isNot(node)) {
      return true;
    }
    if (isComparison(node) || isEquality(node)) {
      return true;
    }
    if (isLogical(node, '&&') || isLogical(node, '||')) {
      return children.every(Boolean);
    }
    return node.kind === 'conditional' && children[1] === true && children[2] === true;
  });
}

export function endsInJump(block: Term): boolean {
  const last = block.children.at(-1);
  return last !== undefined && JUMPS.has(last.kind);
}
