import { afterAll } from 'vitest';
import { typedCases, type CaseError } from '../../test-support/typed-cases.mts';
import { rule } from './no-presence-truthiness.mjs';

const { tester, cleanup, typed } = typedCases('nitpicker-presence-');
afterAll(cleanup);

function error(messageId: string, data: Record<string, string>): CaseError {
  return { messageId, data };
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
  ].map((code) => typed(code)),
  invalid: [
    typed('export function f(x: string | undefined) { return x ? x.trim() : "none"; }', [
      error('presence', { value: 'x' }),
    ]),
    typed('export function f(x: boolean | null, out: { k?: boolean }) { if (x) { out.k = x; } }', [
      error('presence', { value: 'x' }),
    ]),
    typed('export function f<T>(x: T) { return x ? [x] : []; }', [
      error('presence', { value: 'x' }),
    ]),
    typed('type O = { n?: string }; export function f(o: O) { return o.n || "none"; }', [
      error('fallback', { value: 'o.n', fallback: '"none"' }),
    ]),
    typed('export function f(x: boolean | undefined) { const y = x; return y || "on"; }', [
      error('fallback', { value: 'y', fallback: '"on"' }),
    ]),
    typed('export function f(x: (string | undefined)[]) { return x.filter(Boolean); }', [
      error('filter', { predicate: 'Boolean' }),
    ]),
    typed(
      'export function f(x: [string, string | undefined][]) { return x.filter(([, value]) => value); }',
      [error('filter', { predicate: '([, value]) => value' })],
    ),
    typed('export function f(x: (boolean | null)[]) { return x.filter((v) => v); }', [
      error('filter', { predicate: '(v) => v' }),
    ]),
    typed(
      'type Props = { id?: string }; export function f(m: Props, out: string[]) { if (m.id) { out.push(m.id); } }',
      [error('presence', { value: 'm.id' })],
    ),
    typed(
      'type Props = { (): void; dependsOnOwnProps?: boolean }; export function f(p: Props) { return p.dependsOnOwnProps ? Boolean(p.dependsOnOwnProps) : p.length !== 1; }',
      [error('presence', { value: 'p.dependsOnOwnProps' })],
    ),
    typed(
      'export function f(serverState: string | undefined) { return { getServerState: serverState ? () => serverState : undefined }; }',
      [error('presence', { value: 'serverState' })],
    ),
    typed(
      'export function f(x: (string | undefined)[]) { return x.filter((v) => { return v; }); }',
      [error('filter', { predicate: '(v) => { return v; }' })],
    ),
    typed('type O = { n?: string }; export function f(o: O) { return o.n && o.n.length; }', [
      error('presence', { value: 'o.n' }),
    ]),
    typed(
      'type O = { n?: string }; export function f(o: O) { if (!o.n) { return 0; } return o.n.length; }',
      [error('presence', { value: 'o.n' })],
    ),
    typed(
      'type O = { a?: { n?: string } }; export function f(o: O) { return o.a?.n ? o.a.n.trim() : ""; }',
      [error('presence', { value: 'o.a?.n' })],
    ),
    typed('export function f(x: string | undefined) { return x && x.length; }', [
      error('presence', { value: 'x' }),
    ]),
    typed('export function f(x: string | undefined) { if (!x) { return 0; } return x.length; }', [
      error('presence', { value: 'x' }),
    ]),
  ],
});
