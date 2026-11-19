import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { typedCases } from '../../../test-support/typed-cases.mts';
import { rule } from './no-falsy-error-check.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-falsy-error-');
afterAll(cleanup);

const TRUTHINESS = [{ messageId: 'truthiness' }];
const TYPEOF = [{ messageId: 'typeofObject' }];
const PRELUDE = 'declare function run(): Promise<void>; declare function log(v: unknown): void;\n';
const code = (body: string) => `${PRELUDE}export {};\n${body}`;

tester.run('no-falsy-error-check typed', rule, {
  valid: [
    typed(code('type P = { error?: Error | null }; function f(p: P) { return p.error ? 1 : 2; }')),
    typed(
      code(
        'type P = { error: unknown }; function f(p: P) { return p.error !== undefined ? p.error : 1; }',
      ),
    ),
    typed(code('type P = { error: unknown }; function f(p: P) { return p.error ?? 1; }')),
    typed(code('function f(p: any) { return p.error || 1; }')),
    typed(
      code('type P = { error: unknown }; function f(p: P) { return p.error || new Error("x"); }'),
    ),
    typed(code('type P = { cause: Error | undefined }; function f(p: P) { return p.cause || 1; }')),
    typed(
      code('type P = { error: any }; function f(p: P) { if (p.error) { log(p.error.message); } }'),
    ),
    typed(code('type P = { error: unknown }; function f(p: P) { return p.error && p.error; }')),
    typed(code('type P = { status: unknown }; function f(p: P) { return p.status || 1; }')),
  ],
  invalid: [
    typed(
      code('type P = { error?: unknown }; function f(p?: P) { return p?.error ? 1 : 2; }'),
      TRUTHINESS,
    ),
    typed(
      code('type P = { error: unknown }; function f(p: P) { if (p.error) { log(p.error); } }'),
      TRUTHINESS,
    ),
    typed(
      code(
        'type S = { error: unknown }; function f(p: S, s: S) { return { error: p.error || s.error }; }',
      ),
      TRUTHINESS,
    ),
    typed(
      code(
        'type S = { error: unknown }; class A { state!: S; render() { return this.state.error ? "x" : "y"; } }',
      ),
      TRUTHINESS,
    ),
    typed(
      code(
        'type E = { cause: any }; function f(o: E) { const c = o.cause ? wrap(o.cause) : undefined; return c; } declare function wrap(v: unknown): unknown;',
      ),
      TRUTHINESS,
    ),
    typed(
      code(
        'type S = { error: unknown }; function f(s: S) { if (!s.error) { return 1; } return 2; }',
      ),
      TRUTHINESS,
    ),
  ],
});

typescriptRuleTester().run('no-falsy-error-check', rule, {
  valid: [
    { code: 'try { run(); } catch (e) { if (e !== undefined) { log(e); } }' },
    { code: 'try { run(); } catch (e) { const m = e ? e.message : "x"; }' },
    { code: 'try { run(); } catch (e) { if (e) { log(e.message); } }' },
    { code: 'try { run(); } catch (e) { if (e instanceof Error) { log(e); } }' },
    { code: 'run().catch((error) => { if (error) console.error(error); process.exit(1); });' },
    { code: 'try { run(); } catch (e) { if (e && e.code === "X") { log(e); } }' },
    { code: 'try { run(); } catch (e) { if (typeof e === "object" && e !== null) { log(e); } }' },
    { code: 'try { run(); } catch (e) { if (e !== null && typeof e === "object") { log(e); } }' },
    { code: 'try { run(); } catch (e) { if (typeof e === "string") { log(e); } }' },
    { code: 'run().catch((e) => { if (e instanceof Error) { log(e); } });' },
    { code: 'run().catch((e: Error) => { if (e) { log(1); } });' },
    { code: 'run().then(() => 1, (e) => { if (e === undefined) { log(1); } });' },
    { code: 'run().then((v) => { if (v) { log(v); } });' },
    { code: 'function f(err) { if (err) { log(1); } }' },
    { code: 'function f(cb) { try { run(); } catch (e) { cb(); } if (cb) { log(1); } }' },
    { code: 'function f(e) { try { run(); } catch (x) { log(x); } return e ? 1 : 2; }' },
    { code: 'try { run(); } catch ({ message }) { if (message) { log(1); } }' },
    { code: 'function f(flag) { return !!flag; }' },
  ],
  invalid: [
    { code: 'try { run(); } catch (e) { const failed = !!e; return failed; }', errors: TRUTHINESS },
    { code: 'try { run(); } catch (e) { if (e) { log(1); } }', errors: TRUTHINESS },
    { code: 'try { run(); } catch (e) { if (!e) { log(1); } }', errors: TRUTHINESS },
    { code: 'try { run(); } catch (e) { return e ? 1 : 2; }', errors: TRUTHINESS },
    { code: 'try { run(); } catch (error) { while (error) { log(1); } }', errors: TRUTHINESS },
    { code: 'run().catch((e) => { if (e) { log(1); } });', errors: TRUTHINESS },
    { code: 'run().then(() => 1, (reason) => { if (!reason) { log(1); } });', errors: TRUTHINESS },
    { code: 'run().catch((e: unknown) => { if (!e) { log(1); } });', errors: TRUTHINESS },
    { code: 'try { run(); } catch (e) { if (typeof e === "object") { log(e); } }', errors: TYPEOF },
    { code: 'try { run(); } catch (e) { if (typeof e !== "object") { log(e); } }', errors: TYPEOF },
    {
      code: 'run().catch((err) => { const k = typeof err === "object" ? 1 : 2; return k; });',
      errors: TYPEOF,
    },
  ],
});
