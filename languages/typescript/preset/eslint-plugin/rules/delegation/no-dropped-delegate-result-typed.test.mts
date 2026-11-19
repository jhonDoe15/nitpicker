import { typedTsProject } from '../../test-support/projects/typed-ts-project.mts';
import { rule } from './no-dropped-delegate-result.mts';

const project = typedTsProject('nitpicker-dropped-delegate-');
const errors = [{ messageId: 'droppedDelegateResult' as const }];

const HEADER = [
  'declare class Query { exec(): void }',
  'declare const queries: { update(x: number): Query; reset(x: number): void; clear(): Promise<void>; load(): Promise<number> };',
  'declare const names: { update(x: number): void };',
  'declare const gone: { update(x: number): never };',
  'declare const maybe: { update(x: number): undefined };',
  'declare const loose: { update: any };',
  'declare const holder: { load(): Promise<number>; clear(): Promise<void> };',
  '',
].join('\n');

function typed(body: string, extension: 'ts' | 'js' = 'ts') {
  const code = extension === 'ts' ? `${HEADER}${body}` : body;
  return { filename: project.write(code, extension), code };
}

project.tester.run('no-dropped-delegate-result with types', rule, {
  valid: [
    typed('class A { update(x: number) { names.update(x); } }'),
    typed('class A { update(x: number) { maybe.update(x); } }'),
    typed('class A { update(x: number) { gone.update(x); } }'),
    typed('class A { update(x: number) { return queries.update(x); } }'),
    typed('class A { async clear() { await holder.clear(); } }'),
    typed('class A { clear() { holder.clear(); } }'),
    typed('class A { reset(x: number) { queries.reset(x); } }'),
  ],
  invalid: [
    { ...typed('class A { update(x: number) { queries.update(x); } }'), errors },
    { ...typed('class A { update(x: number) { queries.update.call(queries, x); } }'), errors },
    { ...typed('class A { update(x: number) { loose.update(x); } }'), errors },
    { ...typed('class A { async load() { await holder.load(); } }'), errors },
    { ...typed('class A { load() { holder.load(); } }'), errors },
    {
      ...typed(
        'class Base { update(x) { return x; } }\nclass B extends Base { update(x) { super.update(x); } }',
        'js',
      ),
      errors,
    },
  ],
});

project.tester.run('no-dropped-delegate-result skips library declarations', rule, {
  valid: [
    typed('class Stack<T> { private items: T[] = []; push(item: T) { this.items.push(item); } }'),
    typed(
      'class M { set(k: string, v: number) { this.map.set(k, v); } map = new Map<string, number>(); }',
    ),
    typed('class M { delete(k: string) { this.map.delete(k); } map = new Map<string, number>(); }'),
    typed('class M { add(v: number) { this.items.add(v); } items = new Set<number>(); }'),
    typed(
      "import { EventEmitter } from 'node:events';\nclass E { on(n: string, f: () => void) { this.e.on(n, f); } e = new EventEmitter(); }",
    ),
    typed('class S { push(x) { this.items.push(x); } items = []; }', 'js'),
    typed('class A { update(x: number) { missing.update(x); } }'),
    typed('class A { update(x: unknown) { (x as { update(): unknown }).update(); } }'),
  ],
  invalid: [
    { ...typed('class A { update(x: number) { this.constructor.update(x); } }'), errors },
    {
      ...typed(
        'class A extends Base { update(x) { super.update(x); } }\ndeclare class Base { update(x: number): Query }',
      ),
      errors,
    },
    {
      ...typed(
        'class Local { static update(x: number) { return x; } }\nclass A { static update(x: number) { Local.update(x); } }',
      ),
      errors,
    },
    {
      ...typed(
        'class A { push(x: number) { this.store.push(x); } store = new Store(); }\nclass Store { push(x: number) { return x; } }',
      ),
      errors,
    },
  ],
});
