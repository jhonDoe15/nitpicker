import { NODE_TEST, VITEST, runCases } from './test-support/rule-cases.mjs';

runCases('no-unowned-async-assertion plans, promises and done', {
  valid: [
    "it('x', () => { expect.assertions(2); expect(b).toBe(2); setTimeout(() => expect(a).toBe(1)); });",
    "it('x', () => { expect.assertions(2); expect(b).to.be.true; setTimeout(() => expect(a).toBe(1)); });",
    "it('x', () => { expect.assertions(2); expect(b).resolves.toBe(2); setTimeout(() => expect(a).toBe(1)); });",
    `${NODE_TEST}test('x', (t) => { t.plan(2); t.assert.equal(b, 2); setTimeout(() => t.assert.equal(a, 1)); });`,
    "it('x', () => { expect.assertions(2); assert.equal(b, 2); setTimeout(() => assert.equal(a, 1)); });",
    "it('x', async () => { await Promise.all(xs.map((x) => new Promise((r) => setTimeout(() => { expect(x).toBe(1); r(); })))); });",
    "it('x', async () => { await Promise.all(xs.map((x) => { return new Promise((r) => setTimeout(() => { expect(x).toBe(1); r(); })); })); });",
    "it('x', async () => { let ready; ready = new Promise((r) => setTimeout(() => { expect(a).toBe(1); r(); })); await ready; });",
    "it('x', async () => { const waits = { ready: new Promise((r) => bus.once('x', (v) => { expect(v).toBe(1); r(); })) }; start(); await waits.ready; });",
    "it('x', async () => { const pending = []; pending.push(new Promise((r) => setTimeout(() => { expect(a).toBe(1); r(); }))); await Promise.all(pending); });",
    "it('x', async () => { const wait = () => new Promise((r) => setTimeout(() => { expect(a).toBe(1); r(); })); await wait(); });",
    "it('x', async () => { function wait() { return new Promise((r) => setTimeout(() => { expect(a).toBe(1); r(); })); } await wait(); });",
    "const { test } = require('node:test'); test('x', (t, done) => { setTimeout(() => { t.assert.equal(a, 1); done(); }); });",
    "it.each([[1, 2]])('x', (a, b, done) => { setTimeout(() => { expect(a).toBe(1); done(); }); });",
    "it.each([1, 2])('x', (n, done) => { setTimeout(() => { expect(n).toBe(1); done(); }); });",
    "it.each(rows)('x', (a, done) => { setTimeout(() => { expect(a).toBe(1); done(); }); });",
    "it('x', function (this: Mocha.Context, done) { setTimeout(() => { expect(a).toBe(1); done(); }); });",
  ],
  invalid: [
    [
      "it('x', () => { expect.assertions(1); expect(b).toBe(2); setTimeout(() => expect(a).toBe(1)); });",
      'timer',
      'setTimeout',
    ],
    [
      "it('x', () => { expect.assertions(2); expect(b).not.toBe(2); expect(c).toBe(3); setTimeout(() => expect(a).toBe(1)); });",
      'timer',
      'setTimeout',
    ],
    [
      "it('x', async () => { const wait = () => new Promise((r) => setTimeout(() => { expect(a).toBe(1); r(); })); });",
      'timer',
      'setTimeout',
    ],
    [
      "it('x', async () => { const pending = []; pending.push(new Promise((r) => setTimeout(() => { expect(a).toBe(1); r(); }))); });",
      'timer',
      'setTimeout',
    ],
    [
      "it('x', async () => { xs.map((x) => new Promise((r) => setTimeout(() => { expect(x).toBe(1); r(); }))); });",
      'timer',
      'setTimeout',
    ],
    [
      "it('x', () => { const waits = { ready: new Promise((r) => setTimeout(() => { expect(a).toBe(1); r(); })) }; });",
      'timer',
      'setTimeout',
    ],
    [
      "const { test } = require('node:test'); test('x', (t) => { setTimeout(() => t.assert.equal(a, 1)); });",
      'timer',
      'setTimeout',
    ],
    [
      "it.each([[1, 2]])('x', (a, b) => { setTimeout(() => expect(a).toBe(1)); });",
      'timer',
      'setTimeout',
    ],
    [
      "it.each(rows)('x', (a, b) => { setTimeout(() => expect(a).toBe(1)); });",
      'timer',
      'setTimeout',
    ],
    [
      "it('x', function (this: Mocha.Context) { setTimeout(() => expect(this.a).toBe(1)); });",
      'timer',
      'setTimeout',
    ],
    [
      `${VITEST}it.each([[1, 2]])('x', (a, b, done) => { setTimeout(() => { expect(a).toBe(1); done(); }); });`,
      'timer',
      'setTimeout',
    ],
  ],
});
