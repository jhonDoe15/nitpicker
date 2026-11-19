import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { typedCases } from '../../../test-support/typed-cases.mts';
import { rule } from './require-abort-signal-forwarding.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-abort-signal-', {
  lib: ['ES2022', 'DOM'],
});
afterAll(cleanup);

const PRELUDE = [
  'declare function sleep(ms: number, options?: { signal?: AbortSignal }): Promise<void>;',
  'declare function claimNext(options?: { signal?: AbortSignal }): Promise<string>;',
  'declare function watch(path: string, signal: AbortSignal): Promise<void>;',
  'declare function plain(path: string): Promise<void>;',
  'declare function run(job: string): Promise<void>;',
].join('\n');

const code = (body: string) => `${PRELUDE}\n${body}`;
const NOT_FORWARDED = [{ messageId: 'notForwarded' }];
const LOOP = [{ messageId: 'loopIgnoresSignal' }];

tester.run('require-abort-signal-forwarding', rule, {
  valid: [
    typed(
      code(
        'async function f(signal: AbortSignal) { const res = await fetch("/a", { signal }); const reader = res.body!.getReader(); while (true) { const { done } = await reader.read(); if (done) break; } }',
      ),
    ),
    typed(
      code(
        'async function f(signal: AbortSignal) { let stop = false; signal.addEventListener("abort", () => { stop = true; }); while (true) { if (stop) break; await run("a"); } }',
      ),
    ),
    typed(
      code(
        'async function f(signal: AbortSignal) { const gone = new Promise((r) => signal.addEventListener("abort", r)); while (true) { await Promise.race([run("a"), gone]); } }',
      ),
    ),
    typed(code('async function f(signal: AbortSignal) { await sleep(10, { signal }); }')),
    typed(code('async function f(signal: AbortSignal) { await watch("a", signal); }')),
    typed(code('async function f(signal: AbortSignal) { await claimNext({ ...{}, signal }); }')),
    typed(code('async function f(signal: AbortSignal) { await plain("a"); }')),
    typed(code('async function f() { await sleep(10); await claimNext(); }')),
    typed(code('async function f(signal: AbortSignal) { void sleep(10); }')),
    typed(code('async function f(signal: AbortSignal) { await fetch("/a", { signal }); }')),
    typed(code('async function f(signal: AbortSignal) { await sleep(10, undefined); }')),
    typed(
      code(
        'async function f(signal: AbortSignal) { while (!signal.aborted) { await sleep(10, { signal }); } }',
      ),
    ),
    typed(
      code(
        'async function f(signal: AbortSignal) { while (true) { signal.throwIfAborted(); await run("a"); } }',
      ),
    ),
    typed(
      code(
        'async function f(signal: AbortSignal) { while (true) { await sleep(1, { signal }); await run("a"); } }',
      ),
    ),
    typed(
      code(
        'async function f(signal: AbortSignal) { for (const job of ["a"]) { await run(job); } }',
      ),
    ),
    typed(code('async function f() { while (true) { await run("a"); } }')),
    typed(code('async function f(signal: AbortSignal) { while (true) { run("a"); break; } }')),
  ],
  invalid: [
    typed(code('async function f(signal: AbortSignal) { await sleep(10); }'), NOT_FORWARDED),
    typed(code('async function f(signal: AbortSignal) { await sleep(10, {}); }'), NOT_FORWARDED),
    typed(
      code('async function f(signal?: AbortSignal) { const job = await claimNext(); }'),
      NOT_FORWARDED,
    ),
    typed(code('async function f(signal: AbortSignal) { await fetch("/a"); }'), NOT_FORWARDED),
    typed(
      code('async function f(signal: AbortSignal) { await fetch("/a", { method: "GET" }); }'),
      NOT_FORWARDED,
    ),
    typed(
      code(
        'class A { async f(signal: AbortSignal) { await this.g(); } async g(s?: AbortSignal) {} }',
      ),
      NOT_FORWARDED,
    ),
    typed(
      code(
        'async function f(signal: AbortSignal) { const g = async () => { await sleep(10); }; await g(); }',
      ),
      NOT_FORWARDED,
    ),
    typed(
      code('async function poll(signal: AbortSignal) { while (true) { await run("a"); } }'),
      LOOP,
    ),
    typed(code('async function poll(signal: AbortSignal) { for (;;) { await run("a"); } }'), LOOP),
    typed(
      code('async function poll(signal: AbortSignal) { do { await run("a"); } while (true); }'),
      LOOP,
    ),
    typed(
      code(
        'async function poll(signal: AbortSignal) { setTimeout(async () => { while (true) { await run("a"); } }); }',
      ),
      LOOP,
    ),
  ],
});

typescriptRuleTester().run('require-abort-signal-forwarding without types', rule, {
  valid: [
    { code: 'async function f(signal) { while (true) { await run(signal); } }' },
    { code: 'async function f(signal) { while (!signal.aborted) { await run(); } }' },
    { code: 'async function f(options) { while (true) { await run(); } }' },
    { code: 'async function f(signal) { await sleep(10); }' },
  ],
  invalid: [
    {
      code: 'async function f(signal) { while (true) { await run(); } }',
      errors: LOOP,
    },
    {
      code: 'const f = async ({ signal }) => { for (;;) { await run(); } };',
      errors: LOOP,
    },
  ],
});
