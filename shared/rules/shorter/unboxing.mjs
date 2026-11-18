import { key, isComparison, isEquality } from '../../logic/terms.mjs';

function operandsOf(term) {
  const [left, right] = term.children;
  const name = [left, right].find((side) => side?.kind === 'name');
  const literal = [left, right].find((side) => side?.kind === 'literal');
  return name === undefined || literal === undefined ? undefined : { name, literal };
}

function nullChecked(term) {
  const operands = isEquality(term) ? operandsOf(term) : undefined;
  return operands?.literal.value === 'null' ? key(operands.name) : undefined;
}

function unboxed(term) {
  const operands = isEquality(term) || isComparison(term) ? operandsOf(term) : undefined;
  const isValue = operands !== undefined && operands.literal.value !== 'null';
  return isValue && !operands.literal.value.startsWith('"') ? key(operands.name) : undefined;
}

export function isUnboxingGuard(leaf, leaves) {
  const checked = nullChecked(leaf.term);
  return checked !== undefined && leaves.some((other) => unboxed(other.term) === checked);
}
