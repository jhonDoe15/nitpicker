import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule } from '../fake-timers-require-restore.mjs';

Object.assign(RuleTester, { afterAll, afterEach, beforeAll, beforeEach, describe, it });
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});
const env = { messageId: 'unrestoredEnvWrite' };
const global = { messageId: 'unrestoredGlobalWrite' };

tester.run('fake-timers-require-restore direct writes', rule, {
  valid: [
    "process.env.TZ = 'UTC'; it('a', () => {});",
    "beforeAll(() => { process.env.NODE_ENV = 'test'; }); beforeEach(() => { window.matchMedia = vi.fn(); });",
    "vi.hoisted(() => { process.env.MODE = 'x'; }); vi.mock('./a', () => { globalThis.flag = true; return {}; });",
    "it('a', () => { vi.stubEnv('MODE', 'x'); });",
    "const saved = { ...process.env }; afterEach(() => { process.env = saved; }); it('a', () => { process.env.MODE = 'x'; });",
    "it('a', () => { const old = process.env.MODE; process.env.MODE = 'x'; try { run(); } finally { process.env.MODE = old; } });",
    "afterEach(() => { delete process.env.MODE; }); it('a', () => { Object.assign(process.env, { MODE: 'x' }); });",
    'const now = Date.now; afterAll(() => { Date.now = now; }); beforeAll(() => { Date.now = () => 0; });',
    "afterEach(() => { globalThis.fetch = original; }); it('a', () => { window.fetch = fake; });",
    "it('a', () => { const process = { env: {} }; process.env.MODE = 'x'; });",
    "it('a', () => { const Math = { random: 0 }; Math.random = 1; });",
    "it('a', () => { config.env.MODE = 'x'; holder.Date = 1; });",
    "function set(name, value) { process.env[name] = value; } afterEach(() => { set('MODE', undefined); }); it('a', () => { set('MODE', 'x'); });",
    "it('a', () => { process.env.LOG = 'x'; try { run(); } finally { Reflect.deleteProperty(process.env, 'LOG'); } });",
    "const restore = () => { globalThis.fetch = original; }; afterEach(() => restore()); it('a', () => { Reflect.set(globalThis, 'fetch', fake); });",
  ],
  invalid: [
    { code: "it('a', () => { process.env.MODE = 'x'; });", errors: [env] },
    {
      code: "it('a', () => { process.env['MODE'] = 'x'; delete process.env.OTHER; });",
      errors: [env, env],
    },
    { code: "it('a', () => { Object.assign(process.env, { MODE: 'x' }); });", errors: [env] },
    {
      code: "it('a', () => { Reflect.deleteProperty(process.env, 'MODE'); Object.defineProperty(window, 'fetch', { value: fake }); });",
      errors: [env, global],
    },
    {
      code: "function set(name, value) { process.env[name] = value; } it('a', () => { set('MODE', 'x'); });",
      errors: [env],
    },
    {
      code: "describe('x', () => { beforeEach(() => { process.env = { MODE: 'x' }; }); });",
      errors: [env],
    },
    {
      code: "it('a', () => { Date.now = () => 0; Math.random = () => 0.5; globalThis.fetch = fake; console.error = noop; });",
      errors: [global, global, global, global],
    },
    {
      code: "afterEach(() => { Date.now = now; }); it('a', () => { Math.random = () => 0.5; Date.now = () => 0; });",
      errors: [global],
    },
  ],
});
