import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from './time-unit-mismatch.mjs';

const tester = typescriptRuleTester();

function invalid(code, messageId, data) {
  return { code, errors: [{ messageId, ...(data ? { data } : {}) }] };
}

const FULL = {
  left: 'payload.exp',
  leftUnit: 'seconds',
  right: 'Date.now()',
  rightUnit: 'milliseconds',
  factor: '1000',
  example: 'Date.now() / 1000',
};

tester.run('time-unit-mismatch on arithmetic and comparisons', rule, {
  valid: [
    'export const nowSeconds = () => (Date.now() / 1000) >>> 0;',
    'export const ahead = (user: { exp: number }, timeoutMs: number) => user.exp > timeoutMs;',
    'export const differ = (showSeconds: boolean, showMs: boolean) => showSeconds !== showMs;',
    'declare function formatSeconds(seconds: number): string;\ndeclare function formatMillis(millis: number): string;\nexport const label = (s: number, m: number) => formatSeconds(s) + formatMillis(m);',
    'export const expired = (payload: { exp: number }) => payload.exp * 1000 < Date.now();',
    'export const deadline = (ttlSeconds: number) => Date.now() + ttlSeconds * 1000;',
    'export const deadline = (ttlMs: number) => Date.now() + ttlMs;',
    'export const left = (timeoutMs: number, startedMs: number) => timeoutMs - (Date.now() - startedMs);',
    'export const nowSeconds = () => Math.floor(Date.now() / 1000);',
    'const MS_PER_SECOND = 1000; export const toMs = (seconds: number) => seconds * MS_PER_SECOND;',
    'export const label = (timeoutMs: number, timeoutSeconds: number) => "ms " + timeoutMs + " s " + timeoutSeconds;',
    'export const ratio = (elapsedMs: number, budgetSeconds: number) => elapsedMs / (budgetSeconds * 1000);',
    'export const later = (date: Date, delayMs: number) => date.getTime() + delayMs;',
    'export const same = (aSeconds: number, bSecs: number) => aSeconds + bSecs;',
    'export const count = (items: number[], atoms: number) => items.length + atoms;',
    'export const pick = (fast: boolean, ms: number) => fast ? ms : 0;',
  ],
  invalid: [
    invalid(
      'export const expired = (payload: { exp: number }) => payload.exp < Date.now();',
      'mixedUnits',
      FULL,
    ),
    invalid(
      'export const stale = (realm: { getMaxDeltaTimeSeconds(): number }, currentTime: number) => Date.now() - realm.getMaxDeltaTimeSeconds();',
      'mixedUnits',
    ),
    invalid(
      'export const deadline = (ttlSeconds: number) => Date.now() + ttlSeconds;',
      'mixedUnits',
    ),
    invalid(
      'const started = Date.now(); export const late = (limitSeconds: number) => started > limitSeconds;',
      'mixedUnits',
    ),
    invalid('export const late = (delayMs: number) => Date.now() + delayMs * 1000;', 'mixedUnits'),
    invalid('export const tick = () => performance.now() > process.uptime();', 'mixedUnits'),
  ],
});

tester.run('time-unit-mismatch on names, options and arguments', rule, {
  valid: [
    'export const config = (ttlSeconds: number) => ({ ttlMs: ttlSeconds * 1000 });',
    'export function wait(fn: () => void, delayMs: number) { setTimeout(fn, delayMs); }',
    'export function wait(fn: () => void, delaySeconds: number) { setTimeout(fn, delaySeconds * 1000); }',
    'export const at = (payload: { exp: number }) => new Date(payload.exp * 1000);',
    'export class Lock { lockWaitTimeoutMillis = 5000; }',
    'export const read = ({ timeoutMs }: { timeoutMs: number }) => timeoutMs;',
    "import { setTimeout } from 'node:timers/promises'; export const pause = (pauseMs: number) => setTimeout(pauseMs);",
    'function retry(delayMs: number) { return delayMs; } export const go = (backoffMs: number) => retry(backoffMs);',
  ],
  invalid: [
    invalid(
      'export class Lock { lockWaitTimeoutMillis: number; constructor(waitSeconds: number) { this.lockWaitTimeoutMillis = waitSeconds; } }',
      'assignedUnit',
    ),
    invalid(
      'export const config = (ttlSeconds: number) => ({ ttlMs: ttlSeconds });',
      'assignedUnit',
    ),
    invalid(
      'export const nowMs = () => { const nowMs = Date.now() / 1000; return nowMs; };',
      'assignedUnit',
    ),
    invalid(
      'export const read = ({ timeoutSeconds: timeoutMs }: { timeoutSeconds: number }) => timeoutMs;',
      'assignedUnit',
    ),
    invalid(
      'export function wait(fn: () => void, delaySeconds: number) { setTimeout(fn, delaySeconds); }',
      'argumentUnit',
    ),
    invalid(
      'export const at = (payload: { exp: number }) => new Date(payload.exp);',
      'argumentUnit',
    ),
    invalid(
      "import { setTimeout } from 'node:timers/promises'; export const pause = (pauseSeconds: number) => setTimeout(pauseSeconds);",
      'argumentUnit',
    ),
    invalid(
      'function retry(delayMs: number) { return delayMs; } export const go = (backoffSeconds: number) => retry(backoffSeconds);',
      'argumentUnit',
    ),
    invalid(
      'export const abort = (limitSeconds: number) => AbortSignal.timeout(limitSeconds);',
      'argumentUnit',
    ),
  ],
});

tester.run('time-unit-mismatch on epoch times cut to 32 bits', rule, {
  valid: [
    'export const nowSeconds = () => Math.trunc(Date.now() / 1000);',
    'export const flags = (mask: number) => mask | 0;',
    'export const whole = (elapsedMs: number) => elapsedMs | 0;',
  ],
  invalid: [
    invalid('export const nowSeconds = () => (Date.now() / 1000) | 0;', 'epochNarrowed'),
    invalid('export const stamp = () => ~~Date.now();', 'epochNarrowed'),
    invalid('export const issued = (token: { iat: number }) => token.iat | 0;', 'epochNarrowed'),
    invalid('export const stamp = () => Date.now() >>> 0;', 'epochNarrowed'),
  ],
});

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-time-units-')));
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

function typed(code, messageId) {
  const filename = path.join(root, `src/case-${randomUUID()}.ts`);
  writeFileSync(filename, code);
  return { filename, code, ...(messageId === undefined ? {} : { errors: [{ messageId }] }) };
}

const LIBRARY =
  'declare const cache: { set(key: string, value: string, ttlSeconds: number): void };';

typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root }).run(
  'time-unit-mismatch with parameter names from types',
  rule,
  {
    valid: [
      typed(
        `${LIBRARY} export const put = (ttlSeconds: number) => cache.set('k', 'v', ttlSeconds);`,
      ),
    ],
    invalid: [
      typed(
        `${LIBRARY} export const put = (ttlMs: number) => cache.set('k', 'v', ttlMs);`,
        'argumentUnit',
      ),
    ],
  },
);
