import { Cart } from './cart';

export function direct(cart: Cart): void {
  cart.lines().push('x');
}

export function aliased(cart: Cart): void {
  const lines = cart.lines();
  lines.push('x');
}

export function aliasedAssign(cart: Cart): void {
  const lines = cart.lines();
  lines[0] = 'y';
}

export function property(cart: Cart): void {
  cart.settings().limit = 5;
}

export function reassigned(cart: Cart): void {
  let lines = cart.lines();
  lines = [];
  lines.push('x');
}

export function copied(cart: Cart): void {
  const lines = [...cart.lines()];
  lines.push('x');
}

export function sliced(cart: Cart): void {
  const lines = cart.lines().slice();
  lines.push('x');
}

export function readOnly(cart: Cart): number {
  return cart.lines().length;
}
