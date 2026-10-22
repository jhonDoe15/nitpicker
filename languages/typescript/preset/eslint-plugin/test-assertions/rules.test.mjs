import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule as noPartialOutputAssertion } from '../rules/testing/assertions/no-partial-output-assertion.mjs';
import { rule as noSwitchedOffTests } from './no-switched-off-tests.mjs';
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

tester.run('no-switched-off-tests', noSwitchedOffTests, {
  valid: [
    "it('x', () => { expect(run()).toBe(1); });",
    "it.skipIf(process.platform === 'win32')('x', () => {});",
    "it.runIf(isCi)('x', () => {});",
    "it.skipIf(flag)('x', () => {});",
    "it.each([1])('x', () => {});",
    'const plan = { todo: 1 }; plan.todo = 2; items.fails = 3;',
    'const pending = tasks.todo;',
    "it.fails('known bug', () => { expect(run()).toBe(2); });",
    "test.fails.each([1])('known bug', () => {});",
  ],
  invalid: [
    { code: "it.todo('later');", errors: [{ messageId: 'todo' }] },
    { code: "test.todo('later');", errors: [{ messageId: 'todo' }] },
    { code: "describe.todo('later');", errors: [{ messageId: 'todo' }] },
    { code: "it('x', () => {}); it.concurrent.todo('later');", errors: [{ messageId: 'todo' }] },
    { code: "it.skipIf(true)('x', () => {});", errors: [{ messageId: 'literalCondition' }] },
    { code: "it.runIf(false)('x', () => {});", errors: [{ messageId: 'literalCondition' }] },
    { code: "describe.runIf(false)('x', () => {});", errors: [{ messageId: 'literalCondition' }] },
    {
      code: "test.skipIf(true).each([1])('x', () => {});",
      errors: [{ messageId: 'literalCondition' }],
    },
  ],
});

tester.run('no-partial-output-assertion for toMatch', noPartialOutputAssertion, {
  valid: [
    { filename, code: 'expect(id).toMatch(/^[0-9a-f]{8}$/);' },
    { filename, code: 'expect(id).toMatch(/^\\d+$/u);' },
    { filename, code: 'expect(output).not.toMatch(/secret/);' },
    { filename, code: 'expect(output).toMatch(pattern);' },
    { filename, code: "text.toMatch('a');" },
  ],
  invalid: [
    {
      filename,
      code: 'expect(output).toMatch(/total: 3/);',
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename,
      code: 'expect(output).toMatch(/^total/);',
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename,
      code: 'expect(output).toMatch(/total$/);',
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename,
      code: 'expect(output).toMatch(/cost \\$/);',
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename,
      code: "expect(output).toMatch('total: 3');",
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename,
      code: 'expect(output).toMatch(`line ${n}`);',
      errors: [{ messageId: 'partialOutput' }],
    },
    {
      filename,
      code: 'await expect(run()).resolves.toMatch(/done/);',
      errors: [{ messageId: 'partialOutput' }],
    },
  ],
});

const unowned = (code) => ({ filename, code });

tester.run('no-unowned-async-assertion', noUnownedAsyncAssertion, {
  valid: [
    unowned("it('x', () => { expect(run()).toBe(1); });"),
    unowned("it('x', () => setTimeout(() => expect(a).toBe(1)));"),
    unowned(
      "it('x', () => { return new Promise((done) => { setTimeout(() => { expect(a).toBe(1); done(); }); }); });",
    ),
    unowned(
      "it('x', async () => { await new Promise((resolve) => emitter.once('ready', (v) => { expect(v).toBe(1); resolve(); })); });",
    ),
    unowned("it('x', (done) => { setTimeout(() => { expect(a).toBe(1); done(); }); });"),
    unowned(
      "test('x', (t, done) => { fs.readFile(p, (err, data) => { assert.equal(data, 'a'); done(err); }); });",
    ),
    unowned(
      "it('x', function (done) { emitter.on('end', () => { expect(a).to.equal(1); done(); }); });",
    ),
    unowned(
      "it('x', () => { vi.useFakeTimers(); setTimeout(() => expect(a).toBe(1), 10); vi.advanceTimersByTime(10); });",
    ),
    unowned(
      "it('x', async () => { setTimeout(() => expect(a).toBe(1), 10); await vi.runAllTimersAsync(); });",
    ),
    unowned(
      "it('x', () => { const clock = sinon.useFakeTimers(); setTimeout(() => assert.equal(a, 1), 10); clock.tick(10); });",
    ),
    unowned(
      "test('x', (t) => { t.mock.timers.enable(); setTimeout(() => assert.equal(a, 1), 10); t.mock.timers.tick(10); });",
    ),
    unowned("it('x', () => { expect.assertions(1); setTimeout(() => expect(a).toBe(1)); });"),
    unowned("test('x', (t) => { t.plan(1); setTimeout(() => t.assert.equal(a, 1)); });"),
    unowned(
      "it('x', () => { emitter.on('data', (v) => expect(v).toBe(1)); emitter.emit('data', 1); });",
    ),
    unowned("it('x', () => { bus.on('saved', (e) => expect(e.id).toBe(1)); service.save(); });"),
    unowned(
      "it('x', async () => { server.on('request', (r) => expect(r.url).toBe('/')); await fetch(url); });",
    ),
    unowned(
      "it('x', () => { button.addEventListener('click', () => expect(a).toBe(1)); button.click(); });",
    ),
    unowned("it('x', () => { setTimeout(() => log('later')); expect(a).toBe(1); });"),
    unowned("it('x', () => { items.forEach((item) => expect(item).toBe(1)); });"),
    unowned("it('x', () => { validate(input, (result) => expect(result).toBe(true)); });"),
    unowned("it('x', () => { const check = () => setTimeout(() => expect(a).toBe(1)); });"),
    unowned('helper(() => { setTimeout(() => expect(a).toBe(1)); });'),
    unowned(
      "it.each([1])('x', async (n) => { await new Promise((r) => setTimeout(() => { expect(n).toBe(1); r(); })); });",
    ),
  ],
  invalid: [
    {
      ...unowned("it('x', () => { setTimeout(() => { expect(a).toBe(1); }, 10); });"),
      errors: [{ messageId: 'timer', data: { host: 'setTimeout' } }],
    },
    {
      ...unowned("test('x', () => { process.nextTick(() => assert.equal(a, 1)); });"),
      errors: [{ messageId: 'timer', data: { host: 'nextTick' } }],
    },
    {
      ...unowned(
        "it('x', () => { vi.useFakeTimers(); setTimeout(() => expect(a).toBe(1), 10); });",
      ),
      errors: [{ messageId: 'timer', data: { host: 'setTimeout' } }],
    },
    {
      ...unowned("it('x', () => { globalThis.queueMicrotask(() => expect(a).to.equal(1)); });"),
      errors: [{ messageId: 'timer', data: { host: 'queueMicrotask' } }],
    },
    {
      ...unowned("it('x', () => { start(); emitter.on('done', (v) => expect(v).toBe(1)); });"),
      errors: [{ messageId: 'listener', data: { host: 'on' } }],
    },
    {
      ...unowned(
        "it('x', () => { worker.addEventListener('message', (e) => { e.data.should.equal(1); }); });",
      ),
      errors: [{ messageId: 'listener', data: { host: 'addEventListener' } }],
    },
    {
      ...unowned(
        "it('x', () => { fs.readFile(p, 'utf8', (err, text) => { expect(text).toBe('a'); }); });",
      ),
      errors: [{ messageId: 'callback', data: { host: 'readFile' } }],
    },
    {
      ...unowned(
        "test('x', async () => { exec('ls', (error, out) => { assert.equal(out, 'a'); }); await other(); });",
      ),
      errors: [{ messageId: 'callback', data: { host: 'exec' } }],
    },
    {
      ...unowned("it('x', (t) => { setTimeout(() => expect(a).toBe(1)); });"),
      errors: [{ messageId: 'timer', data: { host: 'setTimeout' } }],
    },
  ],
});
