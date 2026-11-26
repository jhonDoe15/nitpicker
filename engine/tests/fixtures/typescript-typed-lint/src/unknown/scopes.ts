type LP = { error: (unknown); cause: ((unknown)); other: (unknown) };
type PR = { readonly cause: (Raw); readonly error: ((Loose)) };
type Raw = unknown;
type Loose = Raw;
export function parens(a: LP, error: (unknown), x: { cause?: ((unknown)) }, y: ((unknown)) | string, z: (Raw), w: (unknown)[]) {}

type A = unknown;
export function first(a: A) {
  type A = string;
}
type B = string;
export function second(b: B) {
  type B = unknown;
}
type C = unknown;
export const arrow = (c: C, d = (x: C) => 1) => {
  type C = string;
};
type D = unknown;
export class Holder {
  method(this: D, { p }: { p: D }, [q]: D[]) {
    type D = string;
  }
  other(e: D) {
    {
      type D = string;
    }
  }
}
type E = string;
export function third(this: E, { p }: { p: E }, d = (x: E) => 1) {
  type E = unknown;
}
type F = unknown;
export function nested(f: F) {
  function inner(g: F) {
    type F = string;
  }
}
