import { term } from '../terms.mts';
import type { Term } from '../typed/term-types.mts';

export function name(value: string): Term {
  return term('name', value);
}

export function number(value: number | string): Term {
  return term('literal', String(value));
}

export function text(value: string): Term {
  return term('literal', JSON.stringify(value));
}

export function not(operand: Term): Term {
  return term('unary', '!', [operand]);
}

export function binary(operator: string, left: Term, right: Term): Term {
  return term('binary', operator, [left, right]);
}

export function integer(operand: Term): Term {
  return { ...operand, integer: true };
}

export function boolean(operand: Term): Term {
  return { ...operand, boolean: true };
}

export function and(left: Term, right: Term): Term {
  return term('logical', '&&', [left, right]);
}

export function or(left: Term, right: Term): Term {
  return term('logical', '||', [left, right]);
}

export function member(object: Term, property: string): Term {
  return term('member', property, [object]);
}

export function call(callee: Term, ...args: Term[]): Term {
  return term('call', undefined, [callee, ...args]);
}
