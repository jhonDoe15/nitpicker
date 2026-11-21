import { WIDTHS } from '../bitvectors/widths.mts';
import { term } from '../terms.mts';
import type { Term, WidthLabel } from '../typed/term-types.mts';
import { binary } from './build.mts';

function typed(shape: Term, label: WidthLabel): Term {
  const { bits, signed } = WIDTHS[label];
  return signed ? { ...shape, bits, signed: true } : { ...shape, bits };
}

export function variable(value: string, label: WidthLabel = 'int'): Term {
  return typed(term('name', value), label);
}

export function constant(value: number | string, label: WidthLabel = 'int'): Term {
  return typed(term('literal', String(value)), label);
}

export function arithmetic(
  operator: string,
  left: Term,
  right: Term,
  label: WidthLabel = 'int',
): Term {
  return typed(term('binary', operator, [left, right]), label);
}

export function negated(operand: Term, label: WidthLabel = 'int', operator = '-'): Term {
  return typed(term('unary', operator, [operand]), label);
}

export function cast(operand: Term, label: WidthLabel): Term {
  return typed(term('cast', label, [operand]), label);
}

export function absolute(operand: Term, label: WidthLabel = 'int'): Term {
  return typed(term('abs', undefined, [operand]), label);
}

export function equal(left: Term, right: Term): Term {
  return binary('===', left, right);
}
