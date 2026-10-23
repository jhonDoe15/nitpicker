import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule as noUnownedAsyncAssertion } from './no-unowned-async-assertion.mjs';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});
const filename = '/repo/test/report.test.ts';
const FS = "import fs from 'node:fs';\n";
const VITEST = "import { expect, it } from 'vitest';\n";
const NODE_TEST = "import test from 'node:test';\n";

const code = (text) => ({ filename, code: text });
const invalid = (text, messageId, host) => ({
  ...code(text),
  errors: [{ messageId, data: { host } }],
});

tester.run('no-unowned-async-assertion waits the test can see', noUnownedAsyncAssertion, {
  valid: [
    "it('x', () => { expect(run()).toBe(1); });",
    "it('x', () => { return new Promise((done) => { setTimeout(() => { expect(a).toBe(1); done(); }); }); });",
    "it('x', () => new Promise((done) => setTimeout(() => { expect(a).toBe(1); done(); })));",
    "it('x', async () => { await new Promise((resolve) => emitter.once('ready', (v) => { expect(v).toBe(1); resolve(); })); });",
    "it('x', async () => { const ready = new Promise((r) => bus.on('x', (v) => { expect(v).toBe(1); r(); })); start(); await ready; });",
    "it('x', async () => { await Promise.all([new Promise((r) => setTimeout(() => { expect(a).toBe(1); r(); }))]); });",
    "it('x', (done) => { setTimeout(() => { expect(a).toBe(1); done(); }); });",
    `${NODE_TEST}test('x', (t, done) => { setTimeout(() => { t.assert.equal(a, 1); done(); }); });`,
    "it('x', function (done) { emitter.on('end', () => { expect(a).to.equal(1); done(); }); });",
    "it('x', () => { vi.useFakeTimers(); setTimeout(() => expect(a).toBe(1), 10); vi.advanceTimersByTime(10); });",
    "it('x', async () => { setTimeout(() => expect(a).toBe(1), 10); await vi.runAllTimersAsync(); });",
    "it('x', () => { const clock = sinon.useFakeTimers(); setTimeout(() => assert.equal(a, 1), 10); clock.tick(10); });",
    "it('x', () => { setTimeout(() => assert.equal(a, 1), 10); clock.next(); });",
    "test('x', (t) => { t.mock.timers.enable(); setTimeout(() => assert.equal(a, 1), 10); t.mock.timers.tick(10); });",
    "it('x', () => { const flush = () => vi.runAllTimers(); setTimeout(() => expect(a).toBe(1)); flush(); });",
    "it('x', async () => { setTimeout(() => expect(a).toBe(1), 10); await sleep(20); });",
    "it('x', async () => { queueMicrotask(() => expect(a).toBe(1)); await Promise.resolve(); });",
    "it('x', () => { expect.assertions(1); setTimeout(() => expect(a).toBe(1)); });",
    "it('x', () => { expect.hasAssertions(); setTimeout(() => expect(a).toBe(1)); });",
    "test('x', (t) => { t.plan(1); setTimeout(() => t.assert.equal(a, 1)); });",
    "it('x', () => { emitter.on('data', (v) => expect(v).toBe(1)); emitter.emit('data', 1); });",
    "it('x', () => { bus.on('saved', (e) => expect(e.id).toBe(1)); service.save(); });",
    "it('x', () => { bus.on('created', (e) => expect(e.id).toBe(1)); new Widget(bus); });",
    "it('x', () => { store.on('change', (v) => expect(v).toBe(1)); store.value = 1; });",
    "it('x', async () => { server.on('request', (r) => expect(r.url).toBe('/')); await fetch(url); });",
    "it('x', () => { button.addEventListener('click', () => expect(a).toBe(1)); button.click(); });",
    "it('x', () => { port.onmessage = (e) => expect(e.data).toBe(1); port.postMessage(1); });",
    "it('x', () => { setTimeout(() => log('later')); expect(a).toBe(1); });",
    "it('x', () => { items.forEach((item) => expect(item).toBe(1)); });",
    "it('x', () => { errors.map((error) => expect(error.code).toBe(1)); });",
    "it('x', () => { assert.throws(() => run(), (err) => { assert.equal(err.code, 'x'); return true; }); });",
    "it('x', async () => { const onError = vi.fn((error) => { expect(error).toBeInstanceOf(Error); }); await run(onError); });",
    "it('x', () => { validate(input, (err, valid) => expect(valid).toBe(true)); });",
    "it('x', () => { process.on('exit', () => console.assert(true)); });",
    "it('x', () => { bus.on('y', (e) => { seen.push(expect.any(Number)); }); });",
    "test.beforeEach(async ({ page }) => { page.on('dialog', (d) => { expect(d.message()).toBe('x'); }); });",
    "test('x', async ({ page }) => { await test.step('s', async () => { page.on('console', (m) => expect(m.text()).toBe('x')); }); await page.goto('/'); });",
    'helper(() => { setTimeout(() => expect(a).toBe(1)); });',
    "it.each([1])('x', async (n) => { await new Promise((r) => setTimeout(() => { expect(n).toBe(1); r(); })); });",
    `${FS}it('x', (done) => { fs.readFile(p, (err, text) => { expect(text).toBe('a'); done(err); }); });`,
    `${FS}it('x', () => { fs.readFileSync(p); });`,
  ].map(code),
  invalid: [
    invalid(
      "it('x', () => { setTimeout(() => { expect(a).toBe(1); }, 10); });",
      'timer',
      'setTimeout',
    ),
    invalid("it('x', () => setTimeout(() => expect(a).toBe(1)));", 'timer', 'setTimeout'),
    invalid(
      "it('x', async () => { return setTimeout(() => expect(a).toBe(1)); });",
      'timer',
      'setTimeout',
    ),
    invalid(
      "test('x', () => { process.nextTick(() => assert.equal(a, 1)); });",
      'microtask',
      'nextTick',
    ),
    invalid(
      "it('x', () => { vi.useFakeTimers(); process.nextTick(() => expect(a).toBe(1)); vi.advanceTimersByTime(10); });",
      'microtask',
      'nextTick',
    ),
    invalid(
      "it('x', () => { vi.useFakeTimers(); setTimeout(() => expect(a).toBe(1), 10); });",
      'timer',
      'setTimeout',
    ),
    invalid(
      "it('x', () => { setTimeout(() => expect(a).toBe(1), 10); game.tick(); });",
      'timer',
      'setTimeout',
    ),
    invalid(
      "it('x', () => { globalThis.queueMicrotask(() => expect(a).to.equal(1)); });",
      'microtask',
      'queueMicrotask',
    ),
    invalid(
      "import { setTimeout as later } from 'node:timers'; it('x', () => { later(() => expect(a).toBe(1)); });",
      'timer',
      'setTimeout',
    ),
    invalid(
      "it('x', () => { requestAnimationFrame(() => expect(a).toBe(1)); });",
      'timer',
      'requestAnimationFrame',
    ),
    invalid(
      "it('x', () => { (() => { setTimeout(() => expect(a).toBe(1)); })(); });",
      'timer',
      'setTimeout',
    ),
    invalid(
      "it('x', () => { const go = () => setTimeout(() => expect(a).toBe(1)); go(); });",
      'timer',
      'setTimeout',
    ),
    invalid(
      "it('x', () => { const cb = () => expect(a).toBe(1); setTimeout(cb, 10); });",
      'timer',
      'setTimeout',
    ),
    invalid(
      "it('x', () => { new Promise((r) => emitter.once('r', (v) => { expect(v).toBe(1); r(); })); });",
      'listener',
      'once',
    ),
    invalid(
      "it('x', () => { start(); emitter.on('done', (v) => expect(v).toBe(1)); });",
      'listener',
      'on',
    ),
    invalid(
      "it('x', () => { emitter.on('data', () => expect(a).toBe(1)); console.log('x'); logger.info('y'); });",
      'listener',
      'on',
    ),
    invalid(
      "it('x', () => { worker.addEventListener('message', (e) => { e.data.should.equal(1); }); });",
      'listener',
      'addEventListener',
    ),
    invalid("it('x', () => { img.onload = () => expect(a).toBe(1); });", 'listener', 'onload'),
    invalid(
      "it('x', () => { new MutationObserver(() => expect(a).toBe(1)); });",
      'listener',
      'MutationObserver',
    ),
    invalid(
      `${FS}it('x', () => { fs.readFile(p, 'utf8', (err, text) => { expect(text).toBe('a'); }); });`,
      'callback',
      'readFile',
    ),
    invalid(
      "import { exec } from 'node:child_process'; test('x', async () => { exec('ls', (error, out) => { assert.equal(out, 'a'); }); await other(); });",
      'callback',
      'exec',
    ),
    invalid(
      `${VITEST}it('x', (done) => { setTimeout(() => { expect(1).toBe(1); done(); }, 5); });`,
      'timer',
      'setTimeout',
    ),
    invalid("it('x', (t) => { setTimeout(() => expect(a).toBe(1)); });", 'timer', 'setTimeout'),
    invalid(
      "it.each([1])('x', (n) => { setTimeout(() => expect(n).toBe(1)); });",
      'timer',
      'setTimeout',
    ),
    invalid(
      "it('x', () => { expect.assertions(0); setTimeout(() => expect(a).toBe(1)); });",
      'timer',
      'setTimeout',
    ),
    invalid(
      "it('x', () => { expect.assertions(1); expect(b).toBe(2); setTimeout(() => expect(a).toBe(1)); });",
      'timer',
      'setTimeout',
    ),
    invalid(
      "it('x', () => { calendar.plan(3); setTimeout(() => expect(a).toBe(1)); });",
      'timer',
      'setTimeout',
    ),
  ],
});
