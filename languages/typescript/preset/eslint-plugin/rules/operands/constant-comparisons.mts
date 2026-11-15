import type { Term } from '../analysis/logic/estree-terms.mts';
import { key } from '../analysis/logic/term-views.mts';
import {
  conjunctionVerdict as untypedConjunctionVerdict,
  disjunctionVerdict as untypedDisjunctionVerdict,
  numberSamples as untypedNumberSamples,
  RELATIONS as untypedRelations,
} from '../../../../../../shared/logic/comparisons/constant-verdicts.mjs';
import { isStable } from './operand-terms.mts';

type Constant =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'string'; readonly value: string };
type Sample = { readonly kind: string; readonly value: number | string };
type Comparison = { readonly operator: string; readonly constant: Constant };
type Decided<Compared> = { readonly redundant: Compared; readonly deciding: Compared };
export type Verdict<Compared> =
  | { readonly verdict: 'impossible' }
  | { readonly verdict: 'always' }
  | (Decided<Compared> & { readonly verdict: 'implied' })
  | (Decided<Compared> & { readonly verdict: 'covered' });
type UntypedVerdict = { readonly verdict: string; readonly redundant?: unknown } | undefined;
type Combine = (
  samples: readonly Sample[],
  first: Comparison,
  second: Comparison,
) => UntypedVerdict;

const RELATIONS: ReadonlyMap<string, unknown> = untypedRelations;
const numberSamples: (first: number, second: number) => Sample[] = untypedNumberSamples;
const conjunctionVerdict: Combine = untypedConjunctionVerdict;
const disjunctionVerdict: Combine = untypedDisjunctionVerdict;

function typedVerdict<Compared>(
  untyped: UntypedVerdict,
  first: Compared,
  second: Compared,
): Verdict<Compared> | undefined {
  const verdict = untyped?.verdict;
  if (verdict === 'impossible' || verdict === 'always') {
    return { verdict };
  }
  const decided =
    untyped?.redundant === first
      ? { redundant: first, deciding: second }
      : { redundant: second, deciding: first };
  return verdict === 'implied' || verdict === 'covered' ? { verdict, ...decided } : undefined;
}

type TermComparison = Comparison & { readonly subject: Term };
export type ConstantComparison = TermComparison & { readonly subjectKey: string };
const MIRRORED = new Map<string, string>([
  ['<', '>'],
  ['<=', '>='],
  ['>', '<'],
  ['>=', '<='],
  ['===', '==='],
  ['!==', '!=='],
]);

function numberConstant(node: Term): Constant | undefined {
  const negated = node.kind === 'unary' && node.value === '-';
  const literal = negated ? node.children[0] : node;
  if (literal?.kind !== 'literal' || typeof literal.value !== 'string') {
    return undefined;
  }
  const isText = literal.value.startsWith('"') || literal.value.trim() === '';
  const value = isText ? Number.NaN : Number(literal.value);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return { kind: 'number', value: negated ? -value : value };
}

function constantOf(node: Term): Constant | undefined {
  const number = numberConstant(node);
  if (number !== undefined) {
    return number;
  }
  const text = node.value;
  if (node.kind !== 'literal' || text === undefined || !text.startsWith('"')) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === 'string' ? { kind: 'string', value: parsed } : undefined;
}

function oriented(node: Term, operator: string): TermComparison | undefined {
  const [left, right] = node.children;
  if (left === undefined || right === undefined) {
    return undefined;
  }
  const onRight = constantOf(right);
  if (onRight !== undefined) {
    return { subject: left, operator, constant: onRight };
  }
  const onLeft = constantOf(left);
  return onLeft === undefined
    ? undefined
    : { subject: right, operator: MIRRORED.get(operator) ?? operator, constant: onLeft };
}

export function constantComparison(term: Term): ConstantComparison | undefined {
  const operator = term.value;
  if (term.kind !== 'binary' || operator === undefined || !MIRRORED.has(operator)) {
    return undefined;
  }
  const comparison = oriented(term, operator);
  if (comparison === undefined || !isStable(comparison.subject)) {
    return undefined;
  }
  const isRelation = RELATIONS.has(comparison.operator);
  if (isRelation && comparison.constant.kind !== 'number') {
    return undefined;
  }
  return { ...comparison, subjectKey: key(comparison.subject) };
}

function samplesFor(first: Constant, second: Constant): Sample[] {
  if (first.kind === 'number' && second.kind === 'number') {
    return numberSamples(first.value, second.value);
  }
  const other = `${String(first.value)}${String(second.value)}.`;
  return [first.value, second.value, other].map((value): Sample => ({
    kind: 'string',
    value: String(value),
  }));
}

/** How two comparisons of one operand against constants combine under `&&` or `||`, if wrongly. */
export function comparisonVerdict<Compared extends ConstantComparison>(
  operator: string,
  first: Compared,
  second: Compared,
): Verdict<Compared> | undefined {
  if (first.subjectKey !== second.subjectKey || first.constant.kind !== second.constant.kind) {
    return undefined;
  }
  const samples = samplesFor(first.constant, second.constant);
  const combine = operator === '&&' ? conjunctionVerdict : disjunctionVerdict;
  return typedVerdict(combine(samples, first, second), first, second);
}
