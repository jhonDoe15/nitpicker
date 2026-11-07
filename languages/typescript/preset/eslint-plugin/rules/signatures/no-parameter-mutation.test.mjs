import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-parameter-mutation.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-parameter-mutation-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      allowJs: true,
      checkJs: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      types: [],
      lib: ['ES2022'],
    },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));
mkdirSync(path.join(root, 'node_modules/http-lib'), { recursive: true });
writeFileSync(
  path.join(root, 'node_modules/http-lib/index.d.ts'),
  'export interface Request { user?: string; locals: { id?: string } }\nexport type Options = { retries?: number };\n',
);
writeFileSync(
  path.join(root, 'node_modules/http-lib/package.json'),
  JSON.stringify({ name: 'http-lib', types: 'index.d.ts' }),
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

function typed(code, name, extension = 'ts') {
  const file = path.join(root, `src/case-${randomUUID()}.${extension}`);
  writeFileSync(file, code);
  return {
    filename: file,
    code,
    ...(name === undefined ? {} : { errors: [{ messageId: 'parameterMutation', data: { name } }] }),
  };
}

tester.run('no-parameter-mutation', rule, {
  valid: [
    'export function add(items: string[], item: string) { return [...items, item]; }',
    'export function add(items: readonly string[], item: string) { return items.concat(item); }',
    'export function add(items: string[], item: string) { const copy = [...items]; copy.push(item); return copy; }',
    'export function add(items: string[], item: string) { const copy = items.slice(); copy[0] = item; return copy; }',
    'export function add(items: string[]) { const local: string[] = []; local.push(items[0] ?? ""); return local; }',
    'export function rename(user: { name: string }) { return { ...user, name: "x" }; }',
    'export function rename(user: { name: string }) { const next = { ...user }; next.name = "x"; return next; }',
    'export function rename(user: { name: string }) { user = { ...user }; user.name = "x"; return user; }',
    'export function rename(user: { name: string }) { user = Object.assign({}, user); user.name = "x"; return user; }',
    'export function fill(user: { name: string }) { return Object.assign({}, user, { name: "x" }); }',
    'export function make(name: string) { const user = { name: "" }; user.name = name; return user; }',
    'export class Account { name = ""; rename(name: string) { this.name = name; } }',
    'export class Account { name = ""; }\nexport function rename(account: Account) { account.name = "x"; }',
    'class Box<T> { value?: T; }\nexport function put(box: Box<string>) { box.value = "x"; }',
    'export function reset(pattern: RegExp) { pattern.lastIndex = 0; }',
    'export function wrap(error: Error) { error.message = "x"; }',
    'import type { Request } from "http-lib";\nexport function login(request: Request) { request.user = "x"; }',
    'import type { Request } from "http-lib";\nexport function login(request: Request) { request.locals.id = "x"; }',
    'import type { Request } from "http-lib";\nexport function login(request: Request & { id?: string }) { request.id = "x"; }',
    'import type { Request } from "http-lib";\ninterface Session extends Request { id?: string }\nexport function login(request: Session) { request.id = "x"; }',
    'import type { Options } from "http-lib";\nexport function retry(options: Options) { options.retries = 1; }',
    'function fill(user: { name: string }) { user.name = "x"; }',
    'export function run(user: { name: string }) { const fill = (target: { name: string }) => { target.name = "x"; }; fill(user); }',
    'export function rename(user: { name: string }) { let next = user; next = { ...next }; next.name = "x"; return next; }',
    'export function count(input: { items: string[] }) { return input.items.length; }',
    'export function fill(o: { size?: number }) { o = { ...o }; o.size ||= 1; return o; }',
    'export class Counter { static count = 0; }\nexport function reset(counter: typeof Counter) { counter.count = 0; }',
    'export enum Level { Low }\nexport function reset(level: typeof Level) { return level.Low; }',
    'export function tag(run: { (): void; label?: string }) { run.label = "x"; }',
    'export function wrap(error: Error | { message: string }) { error.message = "x"; }',
    'export function touch(options: { size?: number }) { return Object.assign(options); }',
    'export function rename(state: { items: string[] }) { state.items.length; }',
    'export function total(items: number[]) { return items.reduce((sum, item) => sum + item, 0); }',
    'export function index(items: string[]) { return items.reduce((table: Record<string, number>, item) => { table[item] = 1; return table; }, {}); }',
    'export function index(items: string[]) { return items.reduce((table: string[], item) => { table.push(item); return table; }, []); }',
    'declare function produce<T>(value: T, recipe: (draft: T) => void): T;\nexport function add(list: string[]) { return produce(list, (draft) => { draft.push("x"); }); }',
    'export function names(table: Readonly<Record<string, number>>) { return Object.keys(table); }',
    'export function first(items: string[]) { return items[0]; }',
    'export function add(items: string[]) { let next = items; next = [...next, "x"]; return next; }',
    'export function set(values: Set<string>) { return new Set([...values, "x"]); }',
    'export function has(table: Map<string, number>) { return table.get("a"); }',
    'export function shadow(items: string[]) { return items.map((items) => { items.length = 0; return items; }); }',
    'export function add(...items: string[][]) { items.push([]); }',
    'export function add(items: string[]) { items = items.slice(); items.push("x"); return items; }',
    'export function add(items: string[]) { items = [...items]; items.push("x"); return items; }',
    'export function add(items: string[]) { items = structuredClone(items); items.push("x"); return items; }',
    'function add(items: string[]) { items.push("x"); }',
    'export class Bag { private fill(items: string[]) { items.push("x"); } #drain(items: string[]) { items.pop(); } }',
    'export function run(items: string[]) { const collect = (list: string[]) => { list.push("x"); }; return collect(items); }',
    'function collect(table: string[], item: string) { table.push(item); return table; }\nexport function all(items: string[]) { return items.reduce(collect, []); }',
    'export function collect(table: string[] = [], item = "") { table.push(item); return table; }',
    'export function collect(table: Record<string, number> = {}, key = "") { table[key] = 1; return table; }',
  ].map((code) => typed(code)),
  invalid: [
    typed('export function add(items: string[], item: string) { items.push(item); }', 'items.push'),
    typed('export function drop(items: string[]) { items.pop(); }', 'items.pop'),
    typed('export function order(items: string[]) { items.sort(); }', 'items.sort'),
    typed('export function clear(items: string[]) { items.length = 0; }', 'items[…]'),
    typed('export function put(items: string[]) { items[0] = "x"; }', 'items[…]'),
    typed('export function bump(counts: number[]) { counts[0]++; }', 'counts[…]'),
    typed(
      'export function put(table: Record<string, number>, key: string) { table[key] = 1; }',
      'table[…]',
    ),
    typed(
      'export function drop(table: Record<string, number>, key: string) { delete table[key]; }',
      'table[…]',
    ),
    typed('export function add(set: Set<string>) { set.add("x"); }', 'set.add'),
    typed('export function put(table: Map<string, number>) { table.set("a", 1); }', 'table.set'),
    typed('export const add = (items: string[]) => items.push("x");', 'items.push'),
    typed('export function add(grid: string[][]) { grid[0]!.push("x"); }', 'grid[0]!.push'),
    typed(
      'export function add(items: string[]) { return items.map((item) => items.push(item)); }',
      'items.push',
    ),
    typed('export function fill(bytes: Uint8Array) { bytes[0] = 1; }', 'bytes[…]'),
    typed('export function bump(counts: Record<string, number>) { counts["a"]!++; }', 'counts[…]'),
    typed(
      'export function add(items: string[]) { items.push("x"); items = items.slice(); }',
      'items.push',
    ),
    typed('export class Bag { fill(items: string[]) { items.push("x"); } }', 'items.push'),
    typed('const add = (items: string[]) => items.push("x");\nexport { add };', 'items.push'),
    typed(
      'export function add(items: string[] | undefined) { items = items ?? []; items.push("x"); }',
      'items.push',
    ),
  ],
});

function written(code, name, extension = 'ts') {
  return {
    ...typed(code, undefined, extension),
    errors: [{ messageId: 'propertyWrite', data: { name } }],
  };
}

tester.run('no-parameter-mutation property writes', rule, {
  valid: [
    typed(
      '/** @param {Error} error */\nexport function wrap(error) { error.message = "x"; }',
      undefined,
      'js',
    ),
    typed('export function wrap(options) { options.size = 1; }', undefined, 'js'),
  ],
  invalid: [
    written('export function rename(user: { name: string }) { user.name = "x"; }', 'user.name'),
    written('export function fill(o: { size?: number }) { o.size ??= 1; }', 'o.size'),
    written('export function fill(o: { size?: number }) { o.size ||= 1; }', 'o.size'),
    written('export function fill(o: { on?: boolean }) { o.on &&= false; }', 'o.on'),
    written('export function grow(o: { size: number }) { o.size += 1; }', 'o.size'),
    written('export function grow(o: { size: number }) { o.size++; }', 'o.size'),
    written('export function grow(o: { size: number }) { o["size"] = 2; }', 'o["size"]'),
    written('export function drop(o: { size?: number }) { delete o.size; }', 'o.size'),
    written(
      'export function set(o: { retry: { count: number } }) { o.retry.count = 3; }',
      'o.retry.count',
    ),
    written(
      'export function fill(o: { size?: number }) { Object.assign(o, { size: 1 }); }',
      'Object.assign(o, …)',
    ),
    written(
      'export function fill(o: { inner: { size?: number } }) { Object.assign(o.inner, { size: 1 }); }',
      'Object.assign(o.inner, …)',
    ),
    written(
      'export function f(o: { a: number }) { (o as { a: number }).a = 1; }',
      '(o as { a: number }).a',
    ),
    written(
      'export function f(o: { a: number }) { (o satisfies { a: number }).a = 1; }',
      '(o satisfies { a: number }).a',
    ),
    written(
      'export function f(o: { a: number }) { (<{ a: number }>o).a = 1; }',
      '(<{ a: number }>o).a',
    ),
    written(
      'export function f(o: { a: number }) { Object.assign(o as { a: number }, { a: 1 }); }',
      'Object.assign(o, …)',
    ),
    written(
      'export function fill(options: { size?: number }) { const o = options; Object.assign(o, { size: 1 }); }',
      'Object.assign(o, …)',
    ),
    written(
      'interface Options { length?: number }\nexport function fill(options: Options) { options.length ??= 8; }',
      'options.length',
    ),
    written(
      'type Message = { id?: string };\nexport function tag(message: Message) { message.id = "x"; }',
      'message.id',
    ),
    written(
      'interface Options { size: number }\nexport function fill(options: Partial<Options>) { options.size = 1; }',
      'options.size',
    ),
    written(
      'export function fill(options?: { size?: number }) { options = options ?? {}; options.size = 1; }',
      'options.size',
    ),
    written(
      'export function fill(options: { size?: number }) { const o = options; o.size = 1; }',
      'o.size',
    ),
    written(
      'export function fill(options?: { size?: number }) { const o = options ?? {}; o.size = 1; }',
      'o.size',
    ),
    written(
      'export function fill(options: { size?: number }) { const o = options as { size?: number }; o.size = 1; }',
      'o.size',
    ),
    written(
      'export function put(table: Record<string, number>) { table.total = 1; }',
      'table.total',
    ),
    written(
      'export function fill<T extends { size?: number }>(options: T) { options.size = 1; }',
      'options.size',
    ),
    written(
      'import type { Request } from "http-lib";\nexport function tag(input: { request: Request; id?: string }) { input.id = "x"; }',
      'input.id',
    ),
    written(
      '/** @param {{ size?: number }} options */\nexport function fill(options) { options.size = 1; }',
      'options.size',
      'js',
    ),
    written(
      '/** @typedef {{ id?: string }} Message */\n/** @param {Message} message */\nexport function tag(message) { message.id = "x"; }',
      'message.id',
      'js',
    ),
    written(
      'export class Store { save(record: { id?: string }) { record.id = "x"; } }',
      'record.id',
    ),
    typed(
      'export function add(input: { items: string[] }) { input.items.push("x"); }',
      'input.items.push',
    ),
    typed(
      'export function add(input: { items: string[] }) { input.items[0] = "x"; }',
      'input.items[…]',
    ),
    typed(
      'export function add(items: string[]) { const list = items; list.push("x"); }',
      'list.push',
    ),
  ],
});
