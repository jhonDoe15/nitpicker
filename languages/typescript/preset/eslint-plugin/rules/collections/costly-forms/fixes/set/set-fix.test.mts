import { afterAll } from 'vitest';
import { typedCases } from '../../../../../test-support/typed-cases.mts';
import { typescriptRuleTester } from '../../../../../test-support/rule-tester.mts';
import { rule } from '../../no-costly-collection-form.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-set-fix-');
afterAll(cleanup);

const HEAD = 'export {}; interface App { c: string; ok: boolean } ';
const declined = [{ messageId: 'arrayAsSet' }];

function fixes(code: string, output: string) {
  return {
    ...typed(`${HEAD}${code}`),
    errors: [
      {
        messageId: 'arrayAsSet',
        suggestions: [{ messageId: 'useSet', output: `${HEAD}${output}` }],
      },
    ],
  };
}

function declines(code: string) {
  return { ...typed(`${HEAD}${code}`), errors: declined };
}

tester.run('no-costly-collection-form set suggestion', rule, {
  valid: [],
  invalid: [
    fixes(
      'export function f(apps: App[]) { const seen: string[] = []; for (const a of apps) { if (!seen.includes(a.c)) { seen.push(a.c); } } return seen; }',
      'export function f(apps: App[]) { const seen = new Set<string>(); for (const a of apps) { if (!seen.has(a.c)) { seen.add(a.c); } } return [...seen]; }',
    ),
    fixes(
      'export function f(apps: App[]) { const seen: string[] = []; for (const a of apps) { if (!seen.includes(a.c)) seen.push(a.c); } return seen.length; }',
      'export function f(apps: App[]) { const seen = new Set<string>(); for (const a of apps) { if (!seen.has(a.c)) seen.add(a.c); } return seen.size; }',
    ),
    fixes(
      'interface Node { children: Node[] } const visited: Node[] = []; export function walk(node: Node) { if (visited.includes(node)) return; visited.push(node); node.children.forEach(walk); }',
      'interface Node { children: Node[] } const visited = new Set<Node>(); export function walk(node: Node) { if (visited.has(node)) return; visited.add(node); node.children.forEach(walk); }',
    ),
    fixes(
      'export function f(rows: App[]) { const ids: string[] = []; for (const row of rows) { if (ids.indexOf(row.c) === -1) { ids.push(row.c); } } return ids; }',
      'export function f(rows: App[]) { const ids = new Set<string>(); for (const row of rows) { if (!ids.has(row.c)) { ids.add(row.c); } } return [...ids]; }',
    ),
    fixes(
      'export function f(rows: App[]) { const ids: string[] = []; for (const row of rows) { if (ids.indexOf(row.c) < 0) { ids.push(row.c); } } return ids; }',
      'export function f(rows: App[]) { const ids = new Set<string>(); for (const row of rows) { if (!ids.has(row.c)) { ids.add(row.c); } } return [...ids]; }',
    ),
    fixes(
      'export function f(rows: App[]) { const ids: string[] = []; for (const row of rows) { if (ids.indexOf(row.c) !== -1) continue; ids.push(row.c); } return ids; }',
      'export function f(rows: App[]) { const ids = new Set<string>(); for (const row of rows) { if (ids.has(row.c)) continue; ids.add(row.c); } return [...ids]; }',
    ),
    fixes(
      'export function f(rows: App[]) { const ids: string[] = []; for (const row of rows) { if (ids.indexOf(row.c) >= 0) { continue; } ids.push(row.c); } return ids; }',
      'export function f(rows: App[]) { const ids = new Set<string>(); for (const row of rows) { if (ids.has(row.c)) { continue; } ids.add(row.c); } return [...ids]; }',
    ),
    fixes(
      'export function f(rows: App[]) { const ids: string[] = []; for (const row of rows) { if (!ids.some((id) => id === row.c)) ids.push(row.c); } return ids; }',
      'export function f(rows: App[]) { const ids = new Set<string>(); for (const row of rows) { if (!ids.has(row.c)) ids.add(row.c); } return [...ids]; }',
    ),
    fixes(
      'export function f(rows: App[]) { const ids: Array<string> = []; for (const row of rows) { !ids.includes(row.c) && ids.push(row.c); } return ids; }',
      'export function f(rows: App[]) { const ids = new Set<string>(); for (const row of rows) { !ids.has(row.c) && ids.add(row.c); } return [...ids]; }',
    ),
    fixes(
      'export function f(rows: App[], n: number) { const seen: number[] = []; for (const row of rows) { if (!seen.includes(n)) { seen.push(n); } } return seen; }',
      'export function f(rows: App[], n: number) { const seen = new Set<number>(); for (const row of rows) { if (!seen.has(n)) { seen.add(n); } } return [...seen]; }',
    ),
    fixes(
      'export function f(rows: App[]) { const seen: (string | undefined)[] = []; for (const row of rows) { if (seen.indexOf(row.c) === -1) { seen.push(row.c); } } return seen; }',
      'export function f(rows: App[]) { const seen = new Set<string | undefined>(); for (const row of rows) { if (!seen.has(row.c)) { seen.add(row.c); } } return [...seen]; }',
    ),
    fixes(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c) && row.ok) { seen.push(row.c); log(seen.length); } } for (const s of seen) { log(s); } return [...seen, "x"]; } declare function log(v: unknown): void;',
      'export function f(rows: App[]) { const seen = new Set<string>(); for (const row of rows) { if (!seen.has(row.c) && row.ok) { seen.add(row.c); log(seen.size); } } for (const s of seen) { log(s); } return [...seen, "x"]; } declare function log(v: unknown): void;',
    ),
    fixes(
      'export function f(rows: App[], flag: boolean) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } const same = flag === (seen.indexOf(row.c) === -1); log(same); } return seen; } declare function log(v: unknown): void;',
      'export function f(rows: App[], flag: boolean) { const seen = new Set<string>(); for (const row of rows) { if (!seen.has(row.c)) { seen.add(row.c); } const same = flag === (!seen.has(row.c)); log(same); } return [...seen]; } declare function log(v: unknown): void;',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } return { seen }; }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } return seen.join(","); }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } return seen.map((s) => s); }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } JSON.stringify(seen); }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } format(seen); } declare function format(v: string[]): void;',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { seen.push(row.c); if (!seen.includes(row.c)) { log(); } } } declare function log(): void;',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } else { seen.push(row.c); } } }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.ok ? "a" : "b"); } } }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c.trim()); } } }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (seen.includes(row.c)) { seen.push(row.c); } } }',
    ),
    declines(
      'export function f(rows: App[], y: boolean) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c) || y) { seen.push(row.c); } } }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (seen.includes(row.c)) continue; log(); seen.push(row.c); } } declare function log(): void;',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { log(); seen.push(row.c); } } } declare function log(): void;',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { rows.forEach(() => seen.push(row.c)); } } }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) seen.push(row.c, row.c); } }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { const n = seen.push(row.c); log(n); } } } declare function log(n: number): void;',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(...[row.c]); } } }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c, 1)) { seen.push(row.c); } } }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!(seen as string[]).includes(row.c)) { seen.push(row.c); } } }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } seen.length = 0; }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } return () => seen; }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; const read = () => { return seen; }; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } return read; }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.some((s) => s === row.c.trim())) { seen.push(row.c.trim()); } } }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.some((s) => s == row.c)) { seen.push(row.c); } } }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } try { return seen; } finally { if (!seen.includes("x")) seen.push("x"); } }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; try { for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } return seen; } finally { log(); } } declare function log(): void;',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; const read = () => seen.length; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } return seen; }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } return seen; function more() { seen.length = 0; } }',
    ),
    declines(
      'export function f(rows: App[]) { let seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } return seen; }',
    ),
    declines(
      'export function f(rows: App[]) { var seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } return seen; }',
    ),
    declines(
      'export function f(rows: App[]) { const seen = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } return seen; }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = new Array(); for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } return seen; }',
    ),
    declines(
      'export function f(rows: App[]) { const Set = 1; const seen: string[] = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } return [seen, Set]; }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] /* kept */ = []; for (const row of rows) { if (!seen.includes(row.c)) { seen.push(row.c); } } return seen; }',
    ),
    declines(
      'export function f(rows: App[]) { const seen: string[] = []; for (const row of rows) { if (!seen /* here */.includes(row.c)) { seen.push(row.c); } } return seen; }',
    ),
    declines(
      'export function f(rows: App[], n: number) { const seen: number[] = []; for (const row of rows) { if (seen.indexOf(n) === -1) { seen.push(n); } } return seen; }',
    ),
    declines(
      'export function f(rows: App[], n: number) { const seen: number[] = []; for (const row of rows) { if (!seen.some((s) => s === n)) { seen.push(n); } } return seen; }',
    ),
    declines(
      'export function f(rows: App[], n: string | number) { const seen: (string | number)[] = []; for (const row of rows) { if (seen.indexOf(n) < 0) { seen.push(n); } } return seen; }',
    ),
    declines(
      'export function f(rows: App[], n: any) { const seen: any[] = []; for (const row of rows) { if (seen.indexOf(n) < 0) { seen.push(n); } } return seen; }',
    ),
    declines(
      'enum Level { Low, High } export function f(rows: App[], n: Level) { const seen: Level[] = []; for (const row of rows) { if (seen.indexOf(n) < 0) { seen.push(n); } } return seen; }',
    ),
    declines(
      'export function f<T>(rows: T[], n: T) { const seen: T[] = []; for (const row of rows) { if (seen.indexOf(n) < 0) { seen.push(n); } } return seen; }',
    ),
  ],
});

typescriptRuleTester().run('no-costly-collection-form set suggestion without types', rule, {
  valid: [],
  invalid: [
    {
      code: 'export function f(rows: string[]) { const seen: string[] = []; for (const r of rows) { if (!seen.includes(r)) { seen.push(r); } } return seen; }',
      errors: [
        {
          messageId: 'arrayAsSet',
          suggestions: [
            {
              messageId: 'useSet',
              output:
                'export function f(rows: string[]) { const seen = new Set<string>(); for (const r of rows) { if (!seen.has(r)) { seen.add(r); } } return [...seen]; }',
            },
          ],
        },
      ],
    },
    {
      code: 'export function f(rows: string[]) { const seen: string[] = []; for (const r of rows) { if (seen.indexOf(r) === -1) { seen.push(r); } } return seen; }',
      errors: declined,
    },
    {
      code: 'export function f(rows) { const seen = []; for (const r of rows) { if (!seen.includes(r)) { seen.push(r); } } return seen; }',
      errors: declined,
    },
  ],
});
