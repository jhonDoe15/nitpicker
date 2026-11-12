import { NODE_TEST, runCases } from './test-support/rule-cases.mjs';

const IMPORTS = "import { expect, it, test } from 'vitest';\n";

runCases('no-assertion-in-loop scope, recognition and constant counts', {
  valid: [
    'const test = load(); test.rows.forEach((row) => { expect(row).toBe(1); });',
    "it('x', () => { const test = load(); test.rows.forEach((row) => { run(row); }); expect(done()).toBe(true); });",
    "it('x', () => { for (let i = 0; i < 3; i++) { expect(tick(i)).toBe(i); } });",
    "it('x', () => { for (let i = 1; i <= 3; i += 1) { expect(tick(i)).toBe(i); } });",
    "it('x', () => { for (let i = 3; i > 0; i--) { expect(tick(i)).toBe(i); } });",
    "it('x', () => { Array.from({ length: 3 }, (_, i) => { expect(tick(i)).toBe(i); }); });",
    "it('x', () => { Array.from({ length: 3 }).forEach((_, i) => { expect(tick(i)).toBe(i); }); });",
    "it('x', () => { for (const i of Array.from({ length: 2 })) { expect(tick(i)).toBe(1); } });",
    "it('x', () => { let i = 0; do { expect(tick(i)).toBe(i); i += 1; } while (i < count); });",
    "it('x', () => { function check(o) { for (const p of o.parts) { expect(p).toBe(1); } } });",
    "it('x', () => { const check = (o) => { o.parts.forEach((p) => { expect(p).toBe(1); }); }; });",
    "it('x', () => { for (const o of orders) { new Promise((resolve) => { resolve(o); }); } });",
    `${NODE_TEST}test('x', async (t) => { for (const c of [{ n: 'a' }, { n: 'b' }]) { await t.test(c.n, () => { assert.ok(c); }); } });`,
    `${NODE_TEST}const ROWS = [{ n: 'a' }] as const;\ntest('x', async (t) => { for (const c of ROWS) { await t.test(c.n, () => { assert.ok(c); }); } });`,
    `${NODE_TEST}test('x', async (t) => { for (const c of [1]) { await t.test('a', async (s) => { await s.test('b', () => { assert.ok(c); }); }); } });`,
    "import { it } from 'vitest'; it('x', () => { page.test('a', () => { for (const o of orders) { run(o); } }); });",
    "it('x', () => { expect.not.arrayContaining([1]); orders.forEach((o) => { expect.not.stringContaining(o); }); });",
    "import chai from 'chai'; it('x', () => { orders.forEach(() => { chai.use(plugin); chai.should(); }); });",
    "it('x', () => { orders.forEach((o) => { setup(o); }); expect(done()).toBe(true); });",
  ],
  invalid: [
    [
      "function run(test) { test.rows.forEach((row) => { expect(row).toBe(1); }); } it('x', () => { run(table); });",
      'loop',
      'forEach',
    ],
    [
      "it('x', () => { const test = load(); test.rows.forEach((row) => { expect(row).toBe(1); }); });",
      'loop',
      'forEach',
    ],
    [
      "const body = () => { for (const o of orders) { expect(o).toBe(1); } }; it('x', body);",
      'loop',
      'for...of',
    ],
    [
      "function body() { for (const o of orders) { expect(o).toBe(1); } } it('x', body);",
      'loop',
      'for...of',
    ],
    [
      "it('x', withFixture(async () => { for (const o of orders) { expect(o).toBe(1); } }));",
      'loop',
      'for...of',
    ],
    [
      "test.each`\n a | b\n ${1} | ${2}\n`('x', ({ a }) => { for (const o of orders) { expect(o).toBe(a); } });",
      'loop',
      'for...of',
    ],
    ["specify('x', () => { for (const o of orders) { expect(o).toBe(1); } });", 'loop', 'for...of'],
    ["xit('x', () => { for (const o of orders) { expect(o).toBe(1); } });", 'loop', 'for...of'],
    ["fit('x', () => { for (const o of orders) { expect(o).toBe(1); } });", 'loop', 'for...of'],
    ["xtest('x', () => { for (const o of orders) { expect(o).toBe(1); } });", 'loop', 'for...of'],
    [
      `${IMPORTS}const check = (o) => run(o);\nit('x', () => { for (const o of orders) { expect(o).toBe(1); } });`,
      'loop',
      'for...of',
    ],
    [
      "import { test as base } from '@playwright/test'; const test = base.extend({}); test('x', () => { for (const o of orders) { expect(o).toBe(1); } });",
      'loop',
      'for...of',
    ],
    [
      "const { test } = require('node:test'); test('x', () => { for (const o of orders) { expect(o).toBe(1); } });",
      'loop',
      'for...of',
    ],
    [
      "it('x', () => { for (let i = 0; i < count; i++) { expect(tick(i)).toBe(i); } });",
      'loop',
      'for',
    ],
    ["it('x', () => { for (let i = 3; i < 3; i++) { expect(tick(i)).toBe(i); } });", 'loop', 'for'],
    [
      "it('x', () => { Array.from({ length: count }, (_, i) => { expect(tick(i)).toBe(i); }); });",
      'loop',
      'Array.from',
    ],
    [
      "it('x', () => { Array.from({ length: 0 }, (_, i) => { expect(tick(i)).toBe(i); }); });",
      'loop',
      'Array.from',
    ],
    [
      "it('x', () => { while (queue.length > 0) { expect(queue.pop()).toBe(1); } });",
      'loop',
      'while',
    ],
    [
      `${NODE_TEST}test('x', async (t) => { for (const c of cases) { await t.test(c.n, () => { assert.ok(c); }); } });`,
      'subtests',
      'for...of',
    ],
    [
      `${NODE_TEST}test('x', async (t) => { for (const c of []) { await t.test(c.n, () => { assert.ok(c); }); } });`,
      'subtests',
      'for...of',
    ],
    [
      `${NODE_TEST}test('x', async (t) => { cases.forEach((c) => { t.it(c.n, () => { assert.ok(c); }); }); });`,
      'subtests',
      'forEach',
    ],
    [
      `${NODE_TEST}const cases = load();\ntest('x', async (t) => { for (const c of cases) { await t.test(c.n, () => { assert.ok(c); }); } });`,
      'subtests',
      'for...of',
    ],
    [
      `${NODE_TEST}test('x', async (t) => { for (const c of [1]) { for (const d of other) { await t.test('a', () => { assert.ok(d); }); } } });`,
      'subtests',
      'for...of',
    ],
    [
      "it('x', () => { orders.forEach((o) => { request(app).get(o).expect(200); }); });",
      'loop',
      'forEach',
    ],
    [
      "import { expect as ex } from 'vitest'; it('x', () => { orders.forEach((o) => { ex(o).toBe(1); }); });",
      'loop',
      'forEach',
    ],
    [
      "import { assertPaid } from './checks'; it('x', () => { orders.forEach((o) => { assertPaid(o); }); });",
      'loop',
      'forEach',
    ],
    [
      "import { expectPaid } from './checks'; it('x', () => { for (const o of orders) { expectPaid(o); } });",
      'loop',
      'for...of',
    ],
    ["it('x', () => { orders.forEach((o) => { expect.soft(o).toBe(1); }); });", 'loop', 'forEach'],
  ],
});

runCases(
  'no-assertion-in-loop with assertion function names',
  {
    valid: ["it('x', () => { for (const o of orders) { verifyPaid(o); } });"],
    invalid: [
      ["it('x', () => { for (const o of orders) { checkPaid(o); } });", 'loop', 'for...of'],
    ],
  },
  [{ assertionFunctionNames: ['checkPaid'] }],
);
