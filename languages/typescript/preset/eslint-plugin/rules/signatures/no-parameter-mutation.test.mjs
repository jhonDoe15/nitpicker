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

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

let counter = 0;

function typed(code, name) {
  counter += 1;
  const file = path.join(root, `src/case-${String(counter)}.ts`);
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
    'export function rename(user: { name: string }) { user.name = "x"; }',
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
  ],
});
