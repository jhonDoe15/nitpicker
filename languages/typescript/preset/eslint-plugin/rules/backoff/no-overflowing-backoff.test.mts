import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-overflowing-backoff.mts';

const ruleTester = typescriptRuleTester();

const powers = [
  'function delay(attempt) { return 100 * 2 ** attempt; }',
  'function delay(attempt) { return 2 ** attempt * 1000; }',
  'function delay(retries) { return Math.pow(2, retries) * 250; }',
  'function wait(n) { return new Promise((resolve) => setTimeout(resolve, 100 * 2 ** n)); }',
  'class A { delay() { return 100 * 2 ** this.attempt; } }',
  'function delay(attempt, base) { return base * 2 ** attempt; }',
  'function delay(attempt) { return 100 * 2 ** (attempt - 1); }',
  'function delay(attempt) { return 100 * Math.pow(2, attempt - 1); }',
];

const shifts = [
  'function delay(attempt) { return 100 * (1 << attempt); }',
  'function delay(retry) { return (1 << retry) * 100; }',
  'function delay(attempt) { return Math.min(100 * (1 << attempt), 30000); }',
];

const valid = [
  'function delay(attempt) { return Math.min(100 * 2 ** attempt, 30000); }',
  'function delay(attempt) { const delay = 100 * 2 ** attempt; return Math.min(delay, 30000); }',
  'function delay(attempt) { return 100 * 2 ** Math.min(attempt, 10); }',
  'function delay(attempt) { const capped = Math.min(attempt, 10); return 100 * 2 ** capped; }',
  'function delay(attempt) { if (attempt > 10) { return 30000; } return 100 * 2 ** attempt; }',
  'async function run(max) { for (let attempt = 0; attempt < max; attempt++) { await sleep(100 * 2 ** attempt); } }',
  'function size(level) { return 1024 * 2 ** level; }',
  'function mask(bit) { return 1 << bit; }',
  'function delay() { return 100 * 2 ** 5; }',
  'function delay(attempt) { return 100 * 3 ** attempt; }',
  'function delay(attempt) { return 100 * attempt; }',
  'function delay(attempt) { return Math.min(100 * 2 ** (attempt - 1), 30000); }',
  'function delay(attempt) { return 100 * 2 ** (Math.min(attempt, 10) - 1); }',
];

ruleTester.run('no-overflowing-backoff', rule, {
  valid: cases(valid),
  invalid: [
    ...powers.map((code) => ({ code, errors: [{ messageId: 'unboundedPower' as const }] })),
    ...shifts.map((code) => ({ code, errors: [{ messageId: 'overflowingShift' as const }] })),
  ],
});
