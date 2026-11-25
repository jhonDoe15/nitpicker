import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-repeated-call.mts';

const tester = typescriptRuleTester();

const CALL = (call: string) => ({ messageId: 'repeatedCall', data: { call } });
const RECURSION = (call: string, name: string) => ({
  messageId: 'repeatedRecursion',
  data: { call, name },
});
const LOOKUP = '\ndeclare function lookup(key: string): { enabled: boolean } | undefined;';

tester.run('no-repeated-call', rule, {
  valid: [
    'export async function f(path: string) { return (await stat(path)).size > 0 && (await stat(path)).isFile(); }\ndeclare function stat(path: string): Promise<{ size: number; isFile(): boolean }>;',
    'import { statSync } from "node:fs";\nexport function f(p: string) { if (statSync(p)) return statSync(p).size; return 0; }',
    'export function f(re: RegExp, s: string) { return re.test(s) ? re.test(s) : false; }',
    'type R = { a: number; b: R | null };\nexport function readTree(r: { pos: number }): R | null { if (r.pos > 3) return null; r.pos++; const a = readTree(r); const b = readTree(r); return { a: 1, b: a ?? b }; }',
    'export function mk(src: string) { let pos = 0; function parseValue(depth: number): unknown[] { if (src[pos] === "]") { pos++; return []; } const key = parseValue(depth + 1); const val = parseValue(depth + 1); return [key, val]; } return parseValue(0); }',
    'export function walk(r: { next(): number }, n: number): number { if (r.next() > n) return 0; const a = walk(r, n); const b = walk(r, n); return a + b; }',
    `export function f(key: string) { const found = lookup(key); return found !== undefined && found.enabled; }${LOOKUP}`,
    'export function f(map: Map<string, number>, key: string) { return map.get(key) !== undefined && map.get(key)! > 1; }',
    'export function f(items: string[], key: string) { return items.indexOf(key) >= 0 && items.indexOf(key) < 3; }',
    'export function f(queue: { next(n: number): number | undefined }) { return queue.next(1) !== undefined && queue.next(1); }',
    'export function f(store: { readToken(n: number): string }) { return store.readToken(1) !== "" && store.readToken(1); }',
    'export function f(value: string) { return Number(value) > 0 && Number(value) < 10; }',
    `export function f(key: string, other: string) { return lookup(key) !== undefined && lookup(other)?.enabled; }${LOOKUP}`,
    `export function f(keys: string[]) { return lookup(keys.shift() ?? "") !== undefined && lookup(keys.shift() ?? "")?.enabled; }${LOOKUP}`,
    `export function f(key: string) { return lookup(key) !== undefined && audit() && lookup(key)?.enabled; }${LOOKUP}\ndeclare function audit(): boolean;`,
    `export function f(key: string) { return lookup(key) !== undefined && use(audit(), lookup(key)); }${LOOKUP}\ndeclare function audit(): boolean; declare function use(a: unknown, b: unknown): boolean;`,
    `export function f(key: string) { if (lookup(key)) { audit(); return lookup(key); } return undefined; }${LOOKUP}\ndeclare function audit(): void;`,
    `export function f(key: string) { return lookup(key) ?? lookup(key.toLowerCase()); }${LOOKUP}`,
    'export function size(node: N): number { return node.kids.reduce((sum, kid) => sum + size(kid), 1); }\ntype N = { kids: N[] };',
    'export function fib(n: number): number { return n < 2 ? n : fib(n - 1) + fib(n - 2); }',
    'export function walk(node: N): number { if (node.left) { return walk(node.left); } return walk(node.left!); }\ntype N = { left?: N };',
    'const memo = new Map<N, number>(); export function depth(node: N): number { if (memo.has(node)) return memo.get(node)!; const value = depth(node) + depth(node); memo.set(node, value); return value; }\ntype N = { kids: N[] };',
    'export function print(node: N): void { print(node); print(node); }\ntype N = { kids: N[] };',
    'export function walk(node: N): number { let at = node; const a = walk(at); at = at.next!; return a + walk(at); }\ntype N = { next?: N };',
    'export class Scanner { private _match(code: number): boolean { return code > 0; } scan() { if (this._match(61)) { return this._match(61); } return false; } }',
    'export function f(path: string) { return basename(path) !== "" && basename(path).startsWith("a"); }\ndeclare function basename(path: string): string;',
    'export function f(text: string, i: number) { return text.slice(0, i).trim() || text.slice(0, i); }',
  ],
  invalid: [
    {
      code: `export function f(key: string) { return lookup(key) !== undefined && lookup(key)!.enabled; }${LOOKUP}`,
      errors: [CALL('lookup(key)')],
    },
    {
      code: 'export function f(node: object) { return resolve(node).isPresent() ? resolve(node).get() : undefined; }\ndeclare function resolve(node: object): { isPresent(): boolean; get(): string };',
      errors: [CALL('resolve(node)')],
    },
    {
      code: `export function f(key: string) { if (lookup(key)) { return lookup(key)?.enabled; } return false; }${LOOKUP}`,
      errors: [CALL('lookup(key)')],
    },
    {
      code: 'export class Types { typeOf(name: string): string | undefined { return undefined; } check(name: string) { if (this.typeOf(name) !== undefined) { const type = this.typeOf(name); return type; } return ""; } }',
      errors: [CALL('this.typeOf(name)')],
    },
    {
      code: 'export function f(text: string) { return JSON.parse(text).ok === true && JSON.parse(text).value; }',
      errors: [CALL('JSON.parse(text)')],
    },
    {
      code: 'export function typeOf(call: C): string { for (const argument of call.args) { const direct = typeOf(argument); const again = typeOf(argument); if (direct !== again) return direct; } return ""; }\ntype C = { args: C[] };',
      errors: [RECURSION('typeOf(argument)', 'typeOf')],
    },
    {
      code: 'export const height = (node: N): number => node.left ? 1 + Math.max(height(node.left), height(node.left)) : 0;\ntype N = { left?: N };',
      errors: [RECURSION('height(node.left)', 'height')],
    },
  ],
});
