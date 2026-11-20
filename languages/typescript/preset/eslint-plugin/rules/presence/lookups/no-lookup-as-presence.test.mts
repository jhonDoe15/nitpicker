import { afterAll } from 'vitest';
import { typedCases } from '../../../test-support/typed-cases.mts';
import { rule } from './no-lookup-as-presence.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-lookup-presence-');
afterAll(cleanup);

const CACHE = [{ messageId: 'cache' }];
const INDEX = [{ messageId: 'index' }];

tester.run('no-lookup-as-presence', rule, {
  valid: [
    'export function f(m: Map<string, any>, k: string) { let s = m.get(k); if (!s) { s = {}; m.set(k, s); } ' +
      'return s; }',
    'export function f(m: Map<string, object>, k: string) { let s = m.get(k); if (!s) { s = {}; m.set(k, s); } ' +
      'return s; }',
    'export function f(m: Map<string, number>, k: string) { let s = m.get(k); if (s === undefined) { s = 1; ' +
      'm.set(k, s); } return s; }',
    'export function f(m: Map<string, number>, k: string) { if (!m.has(k)) { m.set(k, 0); } return m.get(k)!; }',
    'export function f(m: Map<string, number>, k: string) { let s = m.get(k) ?? 5; m.set(k, s); return s; }',
    'export function f(m: Map<string, number | undefined>, k: string) { const s = m.get(k); if (!s) { return 1; ' +
      '} return s; }',
    'export function f(m: Map<string, number>, k: string, o: Map<string, number>) { const s = m.get(k); if (!s) ' +
      '{ o.set(k, 1); } return s; }',
    'export function f(m: Map<string, number>, k: string) { const s = m.get(k); if (!s) { m.set("other", 1); } ' +
      'return s; }',
    'export function f(m: Map<string, () => void>, k: string) { let s = m.get(k); if (!s) { s = () => {}; ' +
      'm.set(k, s); } return s; }',
    'export function f(m: Map<string, string>, k: string) { return m.get(k) || "x"; }',
    'const counts = new Map<string, number>(); export const a = (k: string) => { const n = counts.get(k) || 0; ' +
      'counts.set(k, n + 1); return n; };',
    'const ids = new Map<number, string>(); export const b = (i: number) => { let id = ids.get(i); if (!id) { id ' +
      `= \`synth_\${i}\`; ids.set(i, id); } return id; };`,
    'const names = new Map<string, string>(); export const c = (k: string) => { if (!names.get(k)) { ' +
      'names.set(k, "n"); } return 1; };',
    'export function f(r: Record<string, unknown>, k: string) { return r[k] != null ? 1 : 2; }',
    `export function f(r: Record<string, unknown>, k: string) { if (r[k] === undefined) { return \`Missing \${k}\`; ` +
      '} return null; }',
    'export function f(r: Record<string, unknown>, k: string) { if (r[k] === undefined) { throw new ' +
      'Error("missing"); } return 1; }',
    'export function f(r: Record<string, unknown>, k: string) { return k in r; }',
    'export function f(r: Record<string, string | undefined>, k: string) { return r[k] !== undefined; }',
    'export function f(r: Record<string, unknown>, k: string) { return k in r && r[k] !== undefined ? 1 : 2; }',
    'export function f(r: Record<string, unknown>, k: string) { const v = r[k]; return v !== undefined; }',
    'export function f(r: Record<string, unknown>) { return r["a"] !== undefined ? 1 : 2; }',
    'export function f(r: { a: unknown }) { return r["a"] !== undefined ? 1 : 2; }',
    'export function f(r: Record<string, unknown>, k: string) { return Object.hasOwn(r, k) && r[k] !== undefined ' +
      '? 1 : 2; }',
  ].map((code) => typed(code)),
  invalid: [
    typed(
      'const files = new Map<string, string>(); export const c = (p: string, read: (p: string) => string) => { ' +
        'let t = files.get(p); if (!t) { t = read(p); files.set(p, t); } return t; };',
      CACHE,
    ),
    typed(
      'const seen = new Map<string, number>(); let next = 0; export const d = (k: string) => { let i = ' +
        'seen.get(k); if (i) { return i; } i = next++; seen.set(k, i); return i; };',
      CACHE,
    ),
    typed(
      'declare const m: Map<string, number | undefined>;\nexport const top = m.get("a") || (m.set("a", 1), 2);',
      CACHE,
    ),
    typed(
      'export function f(m: Map<string, number>, k: string) { let s = m.get(k); if (!s) { s = k.length; m.set(k, ' +
        's); } return s; }',
      CACHE,
    ),
    typed(
      'export function f(m: Map<string, string>, k: string) { const s = m.get(k); if (s) { return s; } m.set(k, ' +
        'k); return k; }',
      CACHE,
    ),
    typed(
      'export function f(m: Map<string, number | undefined>, k: string) { let s = m.get(k); if (s === undefined) ' +
        '{ s = k.length || undefined; m.set(k, s); } return s; }',
      CACHE,
    ),
    typed(
      'export function f(m: WeakMap<object, boolean>, k: object) { if (!m.get(k)) { m.set(k, true); } return 1; }',
      CACHE,
    ),
    typed(
      'export function f(m: Map<string, unknown>, k: string) { let s = m.get(k); if (s == null) { s = {}; ' +
        'm.set(k, s); } return s; }',
      CACHE,
    ),
    typed(
      'export function f(m: Map<string, number>, k: string) { const s = m.get(k) || compute(); m.set(k, s); ' +
        'return s; }\ndeclare function compute(): number;',
      CACHE,
    ),
    typed(
      'export function f(m: Map<string, number | null>, k: string) { return m.get(k) ?? (m.set(k, null), 1); }',
      CACHE,
    ),
    typed(
      'export function f(data: Record<string, unknown> | null, id: string) { return data != null && data[id] !== ' +
        'undefined; }',
      INDEX,
    ),
    typed(
      'export function f(data: Record<string, unknown>, id: string) { if (data[id] === undefined) { return 1; } ' +
        'return 2; }',
      INDEX,
    ),
  ],
});
