import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-nan-only-check.mts';

const ruleTester = typescriptRuleTester();

const invalid = [
  'const n = Number(text); if (isNaN(n)) { throw new Error("bad"); }',
  'function f(text, fallback) { const result = parseFloat(text); return isNaN(result) ? fallback : result; }',
  'function f(text, fallback) { const result = Number(text); return Number.isNaN(result) ? fallback : result; }',
  'function f(text) { const value = +text; if (Number.isNaN(value)) { throw new Error("bad"); } return value; }',
  'function f(a, b) { const ratio = a / b; if (isNaN(ratio)) { return 0; } return ratio; }',
  'function f(a, b) { const area = a * b; if (isNaN(area)) { return 0; } return area; }',
  'function f(text) { if (Number.isNaN(Number(text))) { return null; } return text; }',
  'function f(text) { return !isNaN(parseFloat(text)); }',
  'function f(a, b) { const part = (a / b) as number; return isNaN(part) ? 0 : part; }',
  'const check = (text) => { const n = Number(text); return !Number.isNaN(n) && text !== ""; };',
];

const valid = [
  'function f(text, fallback) { const result = Number(text); return Number.isFinite(result) ? result : fallback; }',
  'function f(text, fallback) { const result = Number(text); return ' +
    'Number.isNaN(result) || !isFinite(result) ? fallback : result; }',
  'function f(text) { const result = parseInt(text, 10); return isNaN(result) ? 0 : result; }',
  'function f(text) { const result = Number.parseInt(text, 10); return Number.isNaN(result) ? 0 : result; }',
  'function f(text) { const port = Number(text); if (Number.isNaN(port) || port < 1 ' +
    '|| port > 65535) { throw new Error("bad"); } return port; }',
  'function f(a) { const half = a / 2; return isNaN(half) ? 0 : half; }',
  'function f(a) { const scaled = a * 3; return isNaN(scaled) ? 0 : scaled; }',
  'function f(value) { return isNaN(value) ? 0 : value; }',
  'function f(date) { const time = date.getTime(); return isNaN(time); }',
  'function f(text) { const n = Number(text); if (n === Infinity || n === -Infinity ' +
    '|| isNaN(n)) { return 0; } return n; }',
  'function f(text) { let n = Number(text); n = Math.round(n); return isNaN(n) ? 0 : n; }',
  'function f(text) { const n = Number(text); log(isNaN(n)); }',
  'function f(a, b) { const ratio = a / b; return Number.isFinite(ratio) ? ratio : 0; }',
  'function f(value) { return Number.isNaN(+(value as Date)); }',
  'function f(value) { return isNaN(+value) ? value : parseInt(value, 10); }',
  'function f(keys) { return keys.filter((key) => isNaN(+key)); }',
  'function f(text) { const n = Number(text); if (isNaN(n)) { return 0; } return Math.max(0, Math.min(100, n)); }',
  'function f(text) { const n = Number(text); if (isNaN(n)) { return 0; } return Number.isInteger(n) ? n : 0; }',
];

ruleTester.run('no-nan-only-check', rule, {
  valid: cases(valid),
  invalid: invalid.map((code) => ({ code, errors: [{ messageId: 'nanOnly' as const }] })),
});
