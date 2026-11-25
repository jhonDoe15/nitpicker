import { helper as renamed } from './helpers';
import * as everything from './everything';

export async function* statements(this: Window, first: number, { a, b: [c, , ...d] = [], ...others }: Options, ...rest: string[]): AsyncGenerator<number> {
  'use strict';
  let total = 0, label: string | undefined;
  for (let index = 0, size = rest.length; index < size; index++, total--) total += index;
  for (;;) { break; }
  for (const [key, value] of Object.entries(others)) if (key) continue; else total += Number(value);
  for await (const chunk of renamed(first)) yield chunk;
  for (label in others) { delete others[label]; }
  for (everything.cursor of rest);
  outer: while (total < 10) { do { total += 1; if (total > 5) break outer; } while (true); }
  switch (typeof first) { case 'number': case `string`: total = -total; break; default: { total = +first; } }
  try { throw new Error(`bad ${total} of ${first}!`, { cause: null }); } catch ({ message }) { void message; } finally { debugger; }
  try { yield* inner(); } catch { return; }
  function inner() { return [1, 2n, 0x10, 1e3, /re/gu, , ...rest]; }
  class Local extends Array<number> { size = 1; }
  type Alias = number;
  interface Shape { size: Alias }
  enum Level { Low }
  const object = { a, 'quoted': c, 3: d, [label ?? 'x']: total, renamed, ...others, method() { return this; }, get value() { return 1; }, set value(next) {}, async *gen() {} };
  [total, label = 'none'] = [1];
  ({ a: total, b: { c: label } = {}, ...everything.rest } = object as never);
  total ||= (first, total) ? total++ : --total;
  const fn = async (x?: number) => await x!, tagged = String.raw`a${total}b`, made = new Map<string, number>([['k', 1]]);
  const klass = class Named { static make = () => new Named(); };
  return import.meta.url && new.target && super.toString?.() && everything?.deep?.[0]?.(1) && <number>(first satisfies number) in object && #size in Local;
}

export const table = {
  handlers: [function named(event: Event) { return event; }, (event: Event) => event],
  nested: { deep(value = 1) { return value; }, 'key with space': () => 1, [Symbol.iterator]: function* () {} },
};

describe('suite', () => {
  it(`works`, async () => { expect(table).toBeDefined(); });
  it.each([1])('each', (value) => value);
});

export default class Component {
  static #count = 0;
  private handler = (event: Event): void => { Component.#count += 1; };
  constructor(private readonly service: Service) {}
  get value(): number { return Component.#count; }
  set value(next: number) { Component.#count = next; }
  private hidden(): void {}
  #secret(): void {}
  public shown<T>(this: Component, value: T): T { return value; }
  static async *stream() { yield 1; }
  abstract later(): void;
}

const lazy = function () { return () => () => 1; };
let mutable = () => 1;
export default function () { return lazy; }

export function castTargets(target: { count?: number }, list: unknown[]) {
  (target.count as number) = 1;
  (target.count!)++;
  (<number>target.count) += list.length;
  return target;
}
