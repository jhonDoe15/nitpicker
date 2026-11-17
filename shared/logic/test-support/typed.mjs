import { WIDTHS } from '../bitvectors/widths.mjs';
import { term } from '../terms.mjs';
import { binary } from './build.mjs';

function typed(shape, label) {
  return { ...shape, ...WIDTHS[label] };
}

export function variable(value, label = 'int') {
  return typed(term('name', value), label);
}

export function constant(value, label = 'int') {
  return typed(term('literal', String(value)), label);
}

export function arithmetic(operator, left, right, label = 'int') {
  return typed(term('binary', operator, [left, right]), label);
}

export function negated(operand, label = 'int', operator = '-') {
  return typed(term('unary', operator, [operand]), label);
}

export function cast(operand, label) {
  return typed(term('cast', label, [operand]), label);
}

export function absolute(operand, label = 'int') {
  return typed(term('abs', undefined, [operand]), label);
}

export function equal(left, right) {
  return binary('===', left, right);
}
