import type { Raw, Again, Bag, Failure, Wrapped, Outer, Chain, Box, Name, Handler, Mapped, Conditional, Pair, Shape, Quoted, Computed } from './shapes';
import * as shapes from './shapes';

type Local = unknown;
type LocalBag = Readonly<Record<string, Raw>>;
type LocalName = Name;
type Mixed = { readonly name: Name; readonly bag: Bag };

export function viaImport(value: Raw): Raw {
  return value;
}

export function viaReexport(value: Again): void {}

export function viaNamespace(value: shapes.Raw, other: shapes.Inside.Value, fine: shapes.Name): void {}

export function viaBag(bag: Bag, failure: Failure, wrapped: Wrapped): void {}

export function viaChain(outer: Outer, chain: Chain, box: Box<string>, name: Name): void {}

export function viaHandler(handler: Handler, mapped: Mapped, pair: Pair): void {}

export function viaGeneric(conditional: Conditional<string>, shape: Shape): void {}

export function viaQuoted(quoted: Quoted, computed: Computed): void {}

export function viaLocal(local: Local, bag: LocalBag, name: LocalName, mixed: Mixed): void {}

export type Row = {
  readonly raw: Raw;
  readonly bag: Bag;
  readonly name: Name;
  readonly cause: Raw;
  readonly error: Bag;
  readonly shape: Shape;
};

export interface Service {
  parse(input: Raw): string;
  readonly cause: Raw;
  readonly items: readonly Bag[];
  [key: string]: Raw | Name;
}

export class Holder {
  constructor(private readonly raw: Raw, public name: Name) {}
  method(value: Bag = {}, ...rest: Raw[]): void {}
  readonly field: Raw = 1;
}

export const arrow = (value: Raw, { a }: { readonly a: Bag }): void => {};

export function generic<T extends Raw, U = Bag>(value: T, other: U): void {}

export function inner(): void {
  type Scoped = unknown;
  const f = (value: Scoped, name: Name) => value;
  function g(value: shapes.Failure, bag: shapes.Bag): void {}
}

export function lib(key: PropertyKey, partial: Partial<Row>, record: Record<string, Name>): void {}

export function catches(): void {
  try {
    run();
  } catch (error: Raw) {
    use(error);
  }
}

declare function run(): void;
declare function use(value: Name): void;
