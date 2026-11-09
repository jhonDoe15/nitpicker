import { term } from '../terms.mjs';

export function name(value) {
  return term('name', value);
}

export function number(value) {
  return term('literal', String(value));
}

export function text(value) {
  return term('literal', JSON.stringify(value));
}

export function not(operand) {
  return term('unary', '!', [operand]);
}

export function binary(operator, left, right) {
  return term('binary', operator, [left, right]);
}

export function and(left, right) {
  return term('logical', '&&', [left, right]);
}

export function or(left, right) {
  return term('logical', '||', [left, right]);
}

export function member(object, property) {
  return term('member', property, [object]);
}

export function call(callee, ...args) {
  return term('call', undefined, [callee, ...args]);
}
