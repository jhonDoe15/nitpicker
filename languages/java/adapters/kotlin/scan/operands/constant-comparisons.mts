import {
  conjunctionVerdict as untypedConjunctionVerdict,
  disjunctionVerdict as untypedDisjunctionVerdict,
  numberSamples as untypedNumberSamples,
  isRelation as untypedIsRelation,
} from '../../../../../../shared/logic/comparisons/constant-verdicts.mjs';
import { isStable, nodeKey, nodeText, unwrapped } from './operand-terms.mts';
import type { Forest, Tree } from '../typed/operand-shapes.mts';

type Constant = { kind: string; type: string; value: number | string };
type Oriented = { subject: Tree; operator: string; constant: Constant };
type Sample = { kind: string; value: number | string };
export type ConstantComparison = Oriented & { key: string; subjectKey: string; text: string };
export type Verdict = {
  verdict: string;
  redundant?: ConstantComparison;
  deciding?: ConstantComparison;
};
type Combine = (
  samples: Sample[],
  first: ConstantComparison,
  second: ConstantComparison,
) => Verdict | undefined;

const isRelation: (operator: string) => boolean = untypedIsRelation;
const numberSamples: (first: number, second: number) => Sample[] = untypedNumberSamples;
const conjunctionVerdict: Combine = untypedConjunctionVerdict;
const disjunctionVerdict: Combine = untypedDisjunctionVerdict;

const EQUALITIES = new Set(['==', '!=']);
const MIRRORED = new Map<string, string>([
  ['<', '>'],
  ['<=', '>='],
  ['>', '<'],
  ['>=', '<='],
  ['==', '=='],
  ['!=', '!='],
]);
const INTEGER = /^(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+)(L?)$/;
const DECIMAL = /^(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?$/;

function numberValue(text: string): { value: number; type: string } | undefined {
  const plain = text.replaceAll('_', '');
  const integer = INTEGER.exec(plain);
  if (integer !== null) {
    const value = Number(plain.replace(/L$/, ''));
    return Number.isSafeInteger(value)
      ? { value, type: integer[1] === 'L' ? 'Long' : 'Int' }
      : undefined;
  }
  return DECIMAL.test(plain) ? { value: Number(plain), type: 'Double' } : undefined;
}

function constantOf(forest: Forest, node: Tree): Constant | undefined {
  const inner = unwrapped(forest, node);
  if (inner.operator !== undefined) {
    return undefined;
  }
  const tokens = inner.items.flatMap((item) => forest.tokens[item.token] ?? []);
  const negated =
    tokens.length === 2 && tokens[0]?.text === '-' && inner.items[1]?.close === undefined;
  const [literal] = negated ? tokens.slice(1) : tokens;
  if (literal === undefined || tokens.length !== (negated ? 2 : 1)) {
    return undefined;
  }
  if (literal.kind === 'number') {
    const number = numberValue(literal.text);
    return number === undefined
      ? undefined
      : { kind: 'number', type: number.type, value: negated ? -number.value : number.value };
  }
  const { literal: string } = literal;
  const isPlain =
    literal.kind === 'string' &&
    string !== undefined &&
    !string.template &&
    !string.text.includes('\\') &&
    !negated;
  return isPlain ? { kind: 'string', type: 'String', value: string.text } : undefined;
}

function oriented(forest: Forest, node: Tree & { operator: string }): Oriented | undefined {
  const onRight = constantOf(forest, node.right);
  if (onRight !== undefined) {
    return { subject: node.left, operator: node.operator, constant: onRight };
  }
  const onLeft = constantOf(forest, node.left);
  const mirrored = MIRRORED.get(node.operator);
  return onLeft === undefined || mirrored === undefined
    ? undefined
    : { subject: node.right, operator: mirrored, constant: onLeft };
}

export function constantComparison(forest: Forest, node: Tree): ConstantComparison | undefined {
  const inner = unwrapped(forest, node);
  if (inner.operator === undefined || !MIRRORED.has(inner.operator)) {
    return undefined;
  }
  const comparison = oriented(forest, inner);
  if (comparison === undefined || !isStable(forest, comparison.subject)) {
    return undefined;
  }
  if (isRelation(comparison.operator) && comparison.constant.kind !== 'number') {
    return undefined;
  }
  return {
    ...comparison,
    key: nodeKey(forest, inner),
    subjectKey: nodeKey(forest, comparison.subject),
    text: nodeText(forest, inner),
  };
}

function samplesFor(first: Constant, second: Constant): Sample[] {
  if (first.kind === 'number') {
    return numberSamples(Number(first.value), Number(second.value));
  }
  const other = `${String(first.value)}${String(second.value)}.`;
  return [first.value, second.value, other].map((value) => ({ kind: 'string', value }));
}

function comparable(first: ConstantComparison, second: ConstantComparison): boolean {
  if (first.subjectKey !== second.subjectKey || first.constant.kind !== second.constant.kind) {
    return false;
  }
  const equality = EQUALITIES.has(first.operator) || EQUALITIES.has(second.operator);
  return !equality || first.constant.type === second.constant.type;
}

export function comparisonVerdict(
  operator: string,
  first: ConstantComparison,
  second: ConstantComparison,
): Verdict | undefined {
  if (!comparable(first, second)) {
    return undefined;
  }
  const samples = samplesFor(first.constant, second.constant);
  return operator === '&&'
    ? conjunctionVerdict(samples, first, second)
    : disjunctionVerdict(samples, first, second);
}
