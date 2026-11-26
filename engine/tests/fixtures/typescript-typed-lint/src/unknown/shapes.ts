export type Raw = unknown;
export type Pair = readonly [string, unknown];
export type Bag = Readonly<Record<string, unknown>>;
export type Failure = { readonly cause: unknown; readonly error?: unknown };
export type Wrapped = { readonly failure: Failure };
export type Outer = { readonly inner: Inner };
type Inner = Readonly<Record<string, unknown>>;
export type Loop = { readonly next: Chain };
export type Chain = Loop | string;
export type Box<T> = unknown;
export type Name = string;
export type Handler = (input: unknown) => void;
export type Mapped = { readonly [K in 'a' | 'b']: unknown };
export type Conditional<T> = T extends string ? string : unknown;
export type Quoted = { readonly 'cause': unknown };
export type Computed = { readonly [Symbol.iterator]: unknown };
export type { Raw as Again };
export namespace Inside {
  export type Value = unknown;
}
export interface Shape {
  readonly value: Raw;
  readonly cause: unknown;
}
