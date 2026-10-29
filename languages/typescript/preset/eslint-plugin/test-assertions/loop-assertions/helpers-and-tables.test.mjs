import { NODE_TEST, runCases } from './test-support/rule-cases.mjs';

runCases('no-assertion-in-loop through helpers, async callbacks and tables', {
  valid: [
    "it('x', () => { const check = (o) => expect(o.paid).toBe(true); check(first); });",
    "it('x', () => { const check = (o) => run(o); for (const o of orders) { check(o); } expect(done()).toBe(true); });",
    "it('x', () => { const check = (o) => expect(o.paid).toBe(true); const [first] = orders; check(first); });",
    "function check(o) { expect(o.paid).toBe(true); } it('x', () => { check(order); });",
    "function check(o) { for (const p of o.parts) { expect(p).toBe(1); } } it('x', () => { check(order); });",
    "it('x', async () => { const rows = await Promise.all(items.map(async (x) => load(x))); expect(rows).toEqual([1, 2]); });",
    "it('x', () => { orders.forEach(register); expect(registry.size).toBe(2); });",
    "it('x', () => { const check = (o) => run(o); orders.forEach(check); expect(done()).toBe(true); });",
    "it('x', () => { const log = (o) => console.assert(o); orders.forEach(log); });",
    `${NODE_TEST}test('cases', async (t) => { for (const c of cases) { await t.test(c.name, () => { assert.equal(run(c.input), c.output); }); } });`,
    `${NODE_TEST}test('cases', async (t) => { for (const c of cases) { await t.test(c.name, (s) => { s.assert.equal(run(c.input), c.output); }); } });`,
    `${NODE_TEST}test('cases', async (t) => { cases.forEach((c) => { t.it(c.name, () => { assert.equal(run(c.input), c.output); }); }); });`,
    "it('x', () => { expect(/a/.test(text)).toBe(true); for (const o of orders) { /a/.test(o); } });",
  ],
  invalid: [
    [
      "it('x', () => { const check = (o) => expect(o.paid).toBe(true); for (const o of orders) { check(o); } });",
      'loop',
      'for...of',
    ],
    [
      "it('x', () => { function check(o) { expect(o.paid).toBe(true); } orders.forEach((o) => { check(o); }); });",
      'loop',
      'forEach',
    ],
    [
      "it('x', () => { const check = (o) => expect(o.paid).toBe(true); orders.forEach(check); });",
      'loop',
      'forEach',
    ],
    [
      "it('x', () => { const check = (o) => { expect(o.paid).toBe(true); }; orders.map(check); });",
      'loop',
      'map',
    ],
    [
      "it('x', () => { function check(o) { expect(o.paid).toBe(true); } let i = 0; while (i < 3) { check(orders[i]); i += 1; } });",
      'loop',
      'while',
    ],
    [
      "function check(o) { expect(o.paid).toBe(true); } it('x', () => { for (const o of orders) { check(o); } });",
      'loop',
      'for...of',
    ],
    [
      "const check = (o) => { expect(o.paid).toBe(true); }; it('x', () => { orders.forEach(check); });",
      'loop',
      'forEach',
    ],
    [
      "const inner = (o) => expect(o).toBe(1); const outer = (o) => inner(o); it('x', () => { for (const o of orders) { outer(o); } });",
      'loop',
      'for...of',
    ],
    [
      "const a = (o) => b(o); const b = (o) => a(o) || expect(o).toBe(1); it('x', () => { for (const o of orders) { a(o); } });",
      'loop',
      'for...of',
    ],
    [
      "it('x', () => { function check(list) { for (const o of list) { expect(o).toBe(1); } } check(orders); });",
      'loop',
      'for...of',
    ],
    [
      "it('x', async () => { await Promise.all(items.map(async (x) => expect(await load(x)).toBe(1))); });",
      'loop',
      'map',
    ],
    [
      "it('x', async () => { await Promise.all(items.map(async (x) => { const v = await load(x); expect(v).toBe(1); })); });",
      'loop',
      'map',
    ],
    [
      "it('x', async () => { await Promise.all(items.map((x) => expect(load(x)).resolves.toBe(1))); });",
      'loop',
      'map',
    ],
    [
      "it('x', async () => { items.forEach((x) => { setTimeout(() => { expect(x).toBe(1); }); }); });",
      'loop',
      'forEach',
    ],
    [
      "it('x', () => { expect.assertions(2); for (const o of [1, 2]) { expect(o).toBeGreaterThan(0); } });",
      'table',
      'for...of',
    ],
    [
      "it('x', () => { expect.hasAssertions(); for (const o of orders) { expect(o.paid).toBe(true); } });",
      'loop',
      'for...of',
    ],
    [
      "it('x', () => { expect.assertions(orders.length); orders.forEach((o) => { expect(o.paid).toBe(true); }); });",
      'loop',
      'forEach',
    ],
    [
      "it('x', () => { for (const c of [[1, 2], [3, 4]]) { expect(add(c[0], c[0])).toBe(c[1]); } });",
      'table',
      'for...of',
    ],
    [
      "const table = [[1, 2], [3, 4]]; it('x', () => { for (const [a, b] of table) { expect(add(a, a)).toBe(b); } });",
      'table',
      'for...of',
    ],
    [
      "it('x', () => { [1, 2, 3].forEach((n) => { expect(n).toBeGreaterThan(0); }); });",
      'table',
      'forEach',
    ],
    ["it('x', () => { for (const c of []) { expect(c).toBe(1); } });", 'loop', 'for...of'],
    [
      "it('x', () => { for (const c of cases) { for (const d of c.parts) { expect(d).toBe(1); expect(c).toBe(1); } } });",
      'loop',
      'for...of',
    ],
    [
      `${NODE_TEST}test('x', async (t) => { for (const c of cases) { assert.equal(run(c), 1); } });`,
      'loop',
      'for...of',
    ],
    [
      `${NODE_TEST}test('x', async (t) => { await t.test('inner', () => { for (const c of cases) { assert.equal(run(c), 1); } }); });`,
      'loop',
      'for...of',
    ],
    [
      `${NODE_TEST}test('x', (t) => { for (const c of [1, 2]) { t.assert.equal(run(c), 1); } });`,
      'table',
      'for...of',
    ],
  ],
});
