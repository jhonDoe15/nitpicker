import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-mismatched-precondition-message.mts';

const ruleTester = typescriptRuleTester();

function failing(codes: readonly string[]) {
  return codes.map((code) => ({ code, errors: [{ messageId: 'mismatch' as const }] }));
}

ruleTester.run('no-mismatched-precondition-message', rule, {
  valid: cases([
    "function f(name, value) { if (!name) throw new Error('name must not be empty'); }",
    "function f(name, value) { if (name == null) throw new TypeError('Name is required'); }",
    "function f(name, value) { assert(name, 'name must be set'); }",
    "function f(options) { if (!options.timeout) throw new Error('timeout must be set'); }",
    "function f(name) { if (!name) throw new Error('Count must be positive'); }",
    "function f(name, count) { if (!name) throw new Error('Something went wrong'); }",
    "function f(name, count) { if (!name) { log(name); throw new Error('count must be set'); } }",
    'function f(name, count) { if (!name) throw new Error(`count must be set ${count}`); }',
    "function f(name, count) { if (!name || !count) throw new Error('count must be set'); }",
    "function f(name) { if (!name) throw new Error('count must be set'); }",
    "function f(name, value) { invariant(name, 'value of the field'); }",
    "function f(targetTimeUnit, unit) { if (!targetTimeUnit) throw new Error('TimeUnit must not be null'); }",
    "function useThing(a) { assert(a, 'useThing must be called inside a provider'); }",
    "class A { f(name) { if (!name) throw new Error('name must be set'); } }",
    "function f(a) { assert(a.name, 'a.name must be set'); }",
    "function f(name, value) { if (!name) throw new Error('name must be set'); else use(value); }",
    "function useVim() { const ctx = useContext(X); if (!ctx) throw new Error('useVim must be used in a provider'); }",
    "class A { f() { if (!this.config) throw new Error('AppRig not initialized'); } }",
    "import { Stripe } from 'x'; function f(client) { if (!client) throw new Error('Stripe is not configured'); }",
    "class Driver {} function f(pool) { if (!pool) throw new Error('Driver not connected'); }",
    "function f(title) { const stripped = title.trim(); if (!stripped) throw new Error('title must be non-empty'); }",
    "function f(target, targetType) { if (!target) throw new Error('targetType and target must be set'); }",
    "const name = 'x'; function f(value) { if (!value) throw new Error('name must be set'); }",
  ]),
  invalid: failing([
    "function f(name, value) { if (!value) throw new Error('name must not be empty'); }",
    "function f(name, value) { if (value == null) throw new Error('name is required'); }",
    "function f(name, value) { assert(value, 'name must be set'); }",
    "function f(name, value) { invariant(value, 'Name must be set'); }",
    "function f(name, value) { assert.ok(value, 'name must be set'); }",
    "function f(timeUnit, ttl) { if (ttl === undefined) throw new Error('TimeUnit must not be null'); }",
    "class A { name = ''; f(value) { if (!value) throw new Error('name must be set'); } }",
    "function f(user, token) { if (!user.id) { throw new Error('token must be set'); } }",
  ]),
});
