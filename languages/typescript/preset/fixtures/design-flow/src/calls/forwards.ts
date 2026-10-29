import { Cart } from '../model/cart';

export function target(a: string, b: number): string {
  return a + String(b);
}

export function side(a: string): void {
  void a;
}

export async function load(a: string): Promise<string> {
  return Promise.resolve(a);
}

export const pure = (a: string, b: number): string => target(a, b);

export function partial(a: string): string {
  return target(a, 1);
}

export function reordered(b: number, a: string): string {
  return target(a, b);
}

export function statement(a: string): void {
  side(a);
}

export function logged(a: string): string {
  side(a);
  return target(a, 1);
}

export function changed(a: string, b: number): string {
  return target(a, b).trim();
}

export function spreads(...args: [string, number]): string {
  return target(...args);
}

export function viaMethod(cart: Cart, item: string): void {
  cart.add(item);
}

export async function viaAsync(a: string): Promise<string> {
  return load(a);
}

export async function awaited(a: string): Promise<string> {
  return await load(a);
}

export function constant(): string {
  return target('a', 1);
}

export class Wrapper {
  constructor(private cart: Cart) {}

  add(item: string): void {
    this.cart.add(item);
  }
}
