import { afterAll } from 'vitest';
import { typedCases } from '../../test-support/typed-cases.mts';
import { rule } from './no-blank-number-coercion.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-blank-number-', { types: [] });
afterAll(cleanup);

const HEADER =
  'declare const process: { env: Record<string, string | undefined> };\n' +
  'declare const searchParams: { get(name: string): string | null };\n';

function found(value: string) {
  return [{ messageId: 'blankNumber', data: { value } }];
}

tester.run('no-blank-number-coercion', rule, {
  valid: [
    'export function f() { const raw = process.env.DAYS?.trim(); const value = raw ? Number(raw) : NaN; return ' +
      'Number.isFinite(value) ? value : 0; }',
    'export function f() { const value = Number.parseInt(process.env.DAYS ?? "", 10); if (Number.isNaN(value)) { ' +
      'throw new Error("x"); } return value; }',
    'export function f(text: string) { if (text.trim() === "") { throw new Error("blank"); } const n = ' +
      'Number(text); if (Number.isNaN(n)) { throw new Error("x"); } return n; }',
    'export function f(text: string | undefined) { if (!text) { return 0; } const n = Number(text); if ' +
      '(Number.isNaN(n)) { return 0; } return n; }',
    'export function f(text: string) { const n = Number(text); return n * 2; }',
    'export function f(text: string) { const n = Number(text); if (Number.isNaN(n) || n <= 0) { throw new ' +
      'Error("x"); } return n; }',
    'export function f(text: string) { const n = +text; if (!Number.isFinite(n) || n < 1) { throw new ' +
      'Error("x"); } return n; }',
    'export function f(value: number) { const n = Number(value); return Number.isNaN(n); }',
    'export function f(value: "1" | "2") { const n = Number(value); return Number.isNaN(n); }',
    'export function f(text: string) { const n = Number(text || "5"); return Number.isNaN(n) ? 0 : n; }',
    'export function f(text: string) { return Number.isNaN(Number(text.trim() || "x")); }',
    'export function f(text: string) { return text.length > 0 && Number.isFinite(Number(text)); }',
    'export function f(value: unknown) { const n = Number(value); return Number.isNaN(n); }',
    'export function f(value: Date) { return Number.isNaN(Number(value)); }',
    'export function f(s: string) { const [whole = ""] = s.split("."); const n = Number(whole); if (isNaN(n)) { ' +
      'return s; } return n; }',
  ].map((body) => typed(`${HEADER}${body}`)),
  invalid: [
    typed(
      `${HEADER}export function f() { const value = Number(process.env.TRIAL_DAYS); if (Number.isNaN(value)) { ` +
        `throw new Error("TRIAL_DAYS must be a number"); } return value; }`,
      found('process.env.TRIAL_DAYS'),
    ),
    typed(
      `${HEADER}export function f(text: string) { const n = Number(text); if (isNaN(n)) { throw new Error("x"); ` +
        `} return n; }`,
      found('text'),
    ),
    typed(
      `${HEADER}export function f(text: string | undefined) { return Number.isFinite(Number(text)); }`,
      found('text'),
    ),
    typed(
      `${HEADER}export function f(text: string) { const n = +text; return Number.isNaN(n) ? undefined : n; }`,
      found('text'),
    ),
    typed(
      `${HEADER}export function f() { const n = Number(searchParams.get("page")); if (Number.isNaN(n)) { return ` +
        `1; } return n; }`,
      found('searchParams.get("page")'),
    ),
    typed(
      `${HEADER}export function f(text: string) { const n = Number(text); if (Number.isNaN(n) || n > 100) { ` +
        `throw new Error("x"); } return n; }`,
      found('text'),
    ),
    typed(
      `${HEADER}const value = Number(process.env.TRIAL_DAYS);\nif (Number.isNaN(value)) { throw new Error("x"); }`,
      found('process.env.TRIAL_DAYS'),
    ),
    typed(
      `${HEADER}export function f(text: string) { return Number.isInteger(Number(text)); }`,
      found('text'),
    ),
    typed(
      `${HEADER}export function f(text: string) { const n = Number(text); return n !== n ? 0 : n; }`,
      found('text'),
    ),
    typed(
      `${HEADER}const value = Number(process.env.TRIAL_DAYS); if (Number.isNaN(value)) { throw new Error("x"); }`,
      found('process.env.TRIAL_DAYS'),
    ),
    typed(
      `${HEADER}export function f(text: string) { const n = Number(text); return Number.isInteger(n) ? n : 0; }`,
      found('text'),
    ),
  ],
});
