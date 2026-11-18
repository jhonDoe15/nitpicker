import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-wall-clock-elapsed.mts';

const ruleTester = typescriptRuleTester();

const invalid = [
  'async function wait(done, timeout) { const start = Date.now(); while (!done()) { ' +
    'if (Date.now() - start > timeout) { throw new Error("timeout"); } await tick(); } ' +
    '}',
  'function run(task) { const start = Date.now(); task(); const elapsed = Date.now() ' +
    '- start; if (elapsed > 1000) { warn(); } }',
  'function run(task) { const start = Date.now(); task(); histogram.observe(Date.now() - start); }',
  'function run(task) { const started = new Date().getTime(); task(); metrics.record(Date.now() - started); }',
  'function run(task) { const t0 = +new Date(); task(); const dt = Date.now() - t0; metrics.timing("task", dt); }',
  'function spin(timeout) { const start = Date.now(); while (Date.now() - start < timeout) { work(); } }',
  'function run(task) { const start = Date.now(); task(); const now = Date.now(); if (now - start > 5) { slow(); } }',
  'class A { begin() { this.start = Date.now(); } expired(limit) { return Date.now() - this.start > limit; } }',
];

const valid = [
  'function run(task) { const start = performance.now(); task(); if (performance.now() - start > 1000) { warn(); } }',
  'function run(task) { const start = Date.now(); task(); log(Date.now() - start); }',
  'function run(task) { const start = Date.now(); task(); save({ start }); if (Date.now() - start > 5) { slow(); } }',
  'function run(task, stored) { const start = Date.now(); task(); if (stored.createdAt - start > 5) { slow(); } }',
  'function expired(token) { const now = Date.now(); return token.expiresAt - now < 0; }',
  'function age(user) { return Date.now() - user.createdAt > 1000; }',
  'const start = Date.now(); function check() { return Date.now() - start > 5; }',
  'function run() { const start = Date.now(); return start; }',
  'class A { begin() { this.start = Date.now(); } age() { return Date.now() - this.start; } }',
  'class A { begin() { this.start = 1; } expired(limit) { return Date.now() - this.start > limit; } }',
  'async function f(held) { const from = Date.now(); await held; return Date.now() - from < HOLD_THRESHOLD_MS; }',
  'async function f(held) { const from = Date.now(); await held; const ms = Date.now() - from; return ms < tapLimit; }',
];

ruleTester.run('no-wall-clock-elapsed', rule, {
  valid: cases(valid),
  invalid: invalid.map((code) => ({ code, errors: [{ messageId: 'wallClockElapsed' as const }] })),
});
