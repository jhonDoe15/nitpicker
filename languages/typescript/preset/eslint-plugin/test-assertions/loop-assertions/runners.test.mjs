import { CHAI, NODE_TEST, runCases } from './test-support/rule-cases.mjs';

const MOCHA = "import { expect } from 'chai';\n";
const ASSERT = "import assert from 'node:assert';\n";
const NAMESPACE = "import * as nodeAssert from 'node:assert/strict';\n";
const ALIASED = "import { strictEqual as same, deepStrictEqual } from 'node:assert';\n";
const LOOP = 'for (const o of orders) {';

runCases('no-assertion-in-loop across runners and assertion styles', {
  valid: [
    `${NODE_TEST}test('x', () => { assert.deepStrictEqual(orders, [1, 2]); });`,
    `${NODE_TEST}test('x', (t) => { t.assert.deepEqual(orders, [1, 2]); });`,
    `${CHAI}it('x', () => { expect(orders).to.deep.equal([1, 2]); });`,
    `${CHAI}it('x', () => { assert.deepEqual(orders, [1, 2]); });`,
    "it('x', () => { orders.should.deep.equal([1, 2]); });",
    `${MOCHA}describe('x', () => { it('y', function () { expect(orders).to.have.lengthOf(2); }); });`,
    `${NODE_TEST}describe('x', () => { it('y', () => { assert.ok(orders.every((o) => o.paid)); }); });`,
    `${ASSERT}it('x', () => { const ids = []; ${LOOP} ids.push(o.id); } assert.deepStrictEqual(ids, [1]); });`,
    "test('x', async ({ page }) => { await expect(page.locator('li')).toHaveCount(3); });",
    "jest.describe('x', () => {}); test.each([1])('x', (n) => { expect(n).toBe(1); });",
  ],
  invalid: [
    ["it('x', () => { for (const o of orders) { expect(o).toBe(1); } });", 'loop', 'for...of'],
    [
      "import { expect, it } from 'vitest';\nit('x', () => { for (const o of orders) { expect(o).toBe(1); } });",
      'loop',
      'for...of',
    ],
    ["it('x', () => { for (const o of orders) { expect.soft(o).toBe(1); } });", 'loop', 'for...of'],
    [
      "it('x', async () => { for (const p of pages) { await expect.poll(() => p.size).toBe(1); } });",
      'loop',
      'for...of',
    ],
    [
      "test('x', async ({ page }) => { for (const l of links) { await expect(page.locator(l)).toBeVisible(); } });",
      'loop',
      'for...of',
    ],
    ["it('x', () => { for (const o of orders) { expect(o).to.equal(1); } });", 'loop', 'for...of'],
    [`${CHAI}it('x', function () { ${LOOP} expect(o).to.deep.equal(1); } });`, 'loop', 'for...of'],
    [`${CHAI}it('x', () => { ${LOOP} assert.equal(o, 1); } });`, 'loop', 'for...of'],
    [`${CHAI}it('x', () => { ${LOOP} assert.isTrue(o.paid); } });`, 'loop', 'for...of'],
    ["it('x', () => { for (const o of orders) { o.should.equal(1); } });", 'loop', 'for...of'],
    [
      "it('x', () => { for (const o of orders) { o.should.be.a('string'); run(); } });",
      'loop',
      'for...of',
    ],
    [`${NODE_TEST}test('x', () => { ${LOOP} assert.equal(o, 1); } });`, 'loop', 'for...of'],
    [`${ASSERT}it('x', () => { ${LOOP} assert(o.paid); } });`, 'loop', 'for...of'],
    [`${ASSERT}it('x', () => { ${LOOP} assert.ok(o.paid); } });`, 'loop', 'for...of'],
    [`${NAMESPACE}it('x', () => { ${LOOP} nodeAssert.equal(o, 1); } });`, 'loop', 'for...of'],
    [`${ALIASED}it('x', () => { ${LOOP} same(o, 1); } });`, 'loop', 'for...of'],
    [`${ALIASED}it('x', () => { ${LOOP} deepStrictEqual(o, 1); } });`, 'loop', 'for...of'],
    [`${NODE_TEST}test('x', (t) => { ${LOOP} t.assert.equal(o, 1); } });`, 'loop', 'for...of'],
    [
      `${NODE_TEST}test('x', async (t) => { await t.test('y', (s) => { ${LOOP} s.assert.ok(o); } }); });`,
      'loop',
      'for...of',
    ],
    [
      `${MOCHA}describe('x', () => { it('y', function () { ${LOOP} expect(o).to.be.ok; run(); } }); });`,
      'loop',
      'for...of',
    ],
    [
      "describe('x', () => { it('y', function () { orders.forEach(function (o) { expect(o).toBe(1); }); }); });",
      'loop',
      'forEach',
    ],
    [
      "test.each([1])('x', (n) => { orders.forEach((o) => { expect(o).toBe(n); }); });",
      'loop',
      'forEach',
    ],
    [
      "jest.it('x', () => {}); it('x', () => { orders.forEach((o) => { expect(o).toMatchSnapshot(); }); });",
      'loop',
      'forEach',
    ],
  ],
});
