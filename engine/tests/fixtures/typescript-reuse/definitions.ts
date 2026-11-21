import fallback, * as everything from './everything';
import type { Shape as Outline, Point } from './shapes';
import { type Late, helper, 'quoted name' as quoted } from './helpers';
import './side-effect';
import legacy = require('./legacy');
import Alias = everything.nested.Name;

export const LIMIT = 10;
export const NEGATIVE = -1n;
export const TABLE = { a: 1, 'b': [true, `plain`, /x/u], 3: !false } as const;
export const NOT_LITERAL = { a: null };
export const COMPUTED = { [LIMIT]: 1 };
export const SPREAD = [...TABLE.b];
const wrapped = (<number>(LIMIT as unknown))!;
const again = (LIMIT satisfies number);
let mutable = 1;
var legacyVar = mutable;
export { wrapped as renamed, again };
export { helper as default } from './helpers';
export * from './shapes';
export * as shapes from './shapes';
export type { Point };

declare const ambient: number;
export declare function declared(value: string): void;

export function overloaded(value: string): string;
export function overloaded(value: number): number;
export function overloaded<T extends string | number>(this: Window, value: T, ...rest: readonly T[]): T {
  type Local = { [key: string]: T };
  interface Shape { readonly size?: number }
  const local = (only: T) => only as T;
  const typed = (only?: T): T => only!;
  const two = (first: T, second = first) => <T>first ?? second;
  abstract class Base<U> extends Array<U> implements Iterable<U> {
    declare ghost: U;
    private readonly kept?: U = undefined;
    protected abstract later(): void;
    public override toString(): string;
    public override toString(radix?: number): string { return String(radix); }
    static readonly readonly = 1;
    [index: number]: U;
    constructor(private readonly owner: Base<U>, public count = 0) { super(); }
    get first(): U | undefined { return this[0]; }
  }
  let definite!: Shape;
  label: for (const item of rest) { if (item) { continue label; } break label; }
  return helper<Local>(value, quoted, fallback, legacy, Alias, ambient, definite, local, typed, two, Base) as T;
}

export const arrow = async <T,>(value: T): Promise<T> => value;
export const generator = function* named(count: number) { yield count; };
export const memoized = memo(forwardRef((props: Outline, ref) => null));
export const chained = React?.memo(() => null);
export const called = build(() => null);
export const single = value => value;

export default class Widget<T = Late> extends Base<T> implements Outline, Point {
  static #count = 0;
  @observed() accessor state: T | undefined;
  @bound private handler = (event: Event): void => { Widget.#count += 1; };
  constructor(@inject(TOKEN) private readonly service: Service, readonly label?: string) { super(); };
  declare readonly ghost: string;
  abstract render(): void;
  method?(): void;
  static { Widget.#count = LIMIT; }
}

@sealed
export class Decorated {}

export interface Options<T> extends Base<T>, Other {
  readonly name: string;
  count?: number;
  [key: string]: unknown;
  method<U>(value: U, flag?: boolean): asserts value is U;
  (call: string): void;
  new (construct: number): Options<T>;
  get accessor(): string;
}

export enum Color { Red = 'red', Green = LIMIT, Blue = Green << 1, }
export const enum Flags { None }
export type Mapped<T> = { readonly [K in keyof T]?: T[K] extends infer U ? U : never };
export type Loaded = typeof import('./shapes').nested.Shape;
type Guard = (value: unknown) => value is string;

namespace Outer.Inner { export const deep = LIMIT; }
declare module 'ambient' { export const value: Outer.Inner; }
declare global { interface Window { extra: Guard } }

export function usesLocals(input: Mapped<Loaded>): Color {
  const { a: renamed, b = Flags.None, ...others } = input as never;
  try { return Outer.Inner.deep ? Color.Red : overloaded.call(window, renamed); } catch (error) { throw error; }
}

export const lazy = () => import('./lazy');
export const required = require('./required');
const template = import(`./template`);
const dynamic = import(LIMIT + './no');
export = Widget;
