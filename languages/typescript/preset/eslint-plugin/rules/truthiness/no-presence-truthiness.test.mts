import { afterAll } from 'vitest';
import { typedCases, type CaseError } from '../../test-support/typed-cases.mts';
import { rule } from './no-presence-truthiness.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-presence-');
afterAll(cleanup);

const GENERIC = 'its type is a type parameter, so `0`, `""` and `false` are valid values';
const LITERAL = 'its type names `""` or `false` as a valid value';
const ASSIGNED =
  '`""`, `0` or `false` is assigned or passed for it elsewhere in the project or its tests';

function error(messageId: string, data: Record<string, string>, evidence: string): CaseError {
  return { messageId, data: { ...data, evidence } };
}

tester.run('no-presence-truthiness', rule, {
  valid: [
    'export function f(x: string) { return x ? x.length : 0; }',
    'export function f(x: boolean) { return x ? 1 : 2; }',
    'export function f(x: string | undefined) { return x !== undefined ? x : ""; }',
    'export function f(x: string | undefined) { return x ?? "none"; }',
    'export function f(x: string | undefined) { return x || ""; }',
    'export function f(x: boolean | undefined) { return x || false; }',
    'type O = { a?: boolean; b?: boolean }; export function f(o: O) { const r = o.a || o.b; return r; }',
    'export function f(x: (string | undefined)[]) { return x.filter((v) => { return v !== undefined; }); }',
    'type O = { a?: boolean }; export function f(o: O, y: boolean) { return o.a || y ? 1 : 2; }',
    'type O = { a?: boolean; b?: boolean }; export function f(o: O) { if (!(o.a || o.b)) { return 0; } return 1; }',
    'export function f(x: string | undefined) { return x ? 1 : 2; }',
    'export function f(x: "a" | "b" | undefined) { return x ? x : "c"; }',
    'export function f(x: string | undefined) { return x ? x : "none"; }',
    'export function f(x: string | undefined) { return x || "none"; }',
    'export function f(x: number | undefined) { return x ? x : 0; }',
    'export function f(x: { a: string } | undefined) { return x ? x.a : ""; }',
    'export function f(x: string[]) { return x.filter(Boolean); }',
    'export function f(x: (string | undefined)[]) { return x.filter((v) => v !== undefined); }',
    'export function f<T extends object>(x: T) { return x ? x : null; }',
    'export function search(q: string) { return q; } export function f(req: { query?: string }) { const query = req.query; if (query) { search(query); } }',
    'export function f(title: string | undefined) { return title ? title.trim() : "none"; }',
    'export function f(x: boolean | null, out: { k?: boolean }) { if (x) { out.k = x; } }',
    'type O = { n?: string }; export function f(o: O) { return o.n || "none"; }',
    'export function f(x: (string | undefined)[]) { return x.filter(Boolean); }',
    'export function f(x: (boolean | null)[]) { return x.filter((v) => v); }',
    'type Props = { id?: string }; export function f(m: Props, out: string[]) { if (m.id) { out.push(m.id); } }',
    'type O = { n?: string }; export function f(o: O) { if (!o.n) { return 0; } return o.n.length; }',
    'declare function show(s: string): void; export function f(cond: boolean) { let error: string | undefined = ""; if (cond) { error = "x"; } if (error) { show(error); } }',
    'declare function use(s: string): void; export function f(q: string | undefined = "") { if (q) { use(q); } }',
  ].map((code) => typed(code)),
  invalid: [
    typed('export function f<T>(items: T[]) { return items.filter((item) => item); }', [
      error('filter', { predicate: '(item) => item' }, GENERIC),
    ]),
    typed('export function compact<T>(items: T[]) { return items.filter(Boolean); }', [
      error('filter', { predicate: 'Boolean' }, GENERIC),
    ]),
    typed('export function f<T>(x: T) { return x ? [x] : []; }', [
      error('presence', { value: 'x' }, GENERIC),
    ]),
    typed('export function f(x: "" | "auto" | undefined) { return x ? x.trim() : "none"; }', [
      error('presence', { value: 'x' }, LITERAL),
    ]),
    typed(
      'export function f(title: string | undefined) { return title ? title.trim() : "none"; } export const r = f("");',
      [error('presence', { value: 'title' }, ASSIGNED)],
    ),
    typed(
      'export function f(x: boolean | null, out: { k?: boolean }) { if (x) { out.k = x; } } f(false, {});',
      [error('presence', { value: 'x' }, ASSIGNED)],
    ),
    typed(
      'type O = { n?: string }; export const seed: O = { n: "" }; export function f(o: O) { return o.n || "none"; }',
      [error('fallback', { value: 'o.n', fallback: '"none"' }, ASSIGNED)],
    ),
    typed(
      'type S = { mode?: boolean }; export function g(s: S) { s.mode = false; } export function f(s: S) { return s.mode || "on"; }',
      [error('fallback', { value: 's.mode', fallback: '"on"' }, ASSIGNED)],
    ),
    typed('export function f(x: ("" | "a" | undefined)[]) { return x.filter(Boolean); }', [
      error('filter', { predicate: 'Boolean' }, LITERAL),
    ]),
    typed(
      'export function f(x: [string, "" | "a" | undefined][]) { return x.filter(([, value]) => value); }',
      [error('filter', { predicate: '([, value]) => value' }, LITERAL)],
    ),
    typed('export function f(x: (boolean | "auto" | null)[]) { return x.filter((v) => v); }', [
      error('filter', { predicate: '(v) => v' }, LITERAL),
    ]),
    typed(
      'type Props = { id?: string }; export const p: Props = { id: "" }; export function f(m: Props, out: string[]) { if (m.id) { out.push(m.id); } }',
      [error('presence', { value: 'm.id' }, ASSIGNED)],
    ),
    typed(
      'type Props = { (): void; own?: boolean }; export function g(p: Props) { p.own = false; } export function f(p: Props) { return p.own ? Boolean(p.own) : p.length !== 1; }',
      [error('presence', { value: 'p.own' }, ASSIGNED)],
    ),
    typed(
      'export function f(serverState: string | undefined) { return { getServerState: serverState ? () => serverState : undefined }; } f("");',
      [error('presence', { value: 'serverState' }, ASSIGNED)],
    ),
    typed(
      'export function f(x: ("" | "a" | undefined)[]) { return x.filter((v) => { return v; }); }',
      [error('filter', { predicate: '(v) => { return v; }' }, LITERAL)],
    ),
    typed('type O = { n?: "" | "a" }; export function f(o: O) { return o.n && o.n.length; }', [
      error('presence', { value: 'o.n' }, LITERAL),
    ]),
    typed(
      'type O = { n?: string }; export const s: O = { n: "" }; export function f(o: O) { if (!o.n) { return 0; } return o.n.length; }',
      [error('presence', { value: 'o.n' }, ASSIGNED)],
    ),
    typed(
      'type O = { a?: { n?: string } }; export const s: O["a"] = { n: "" }; export function f(o: O) { return o.a?.n ? o.a.n.trim() : ""; }',
      [error('presence', { value: 'o.a?.n' }, ASSIGNED)],
    ),
    typed('export function f(x: string | undefined) { return x && x.length; } f("");', [
      error('presence', { value: 'x' }, ASSIGNED),
    ]),
    typed(
      'export function f(x: string | undefined) { if (!x) { return 0; } return x.length; } f("");',
      [error('presence', { value: 'x' }, ASSIGNED)],
    ),
  ],
});
