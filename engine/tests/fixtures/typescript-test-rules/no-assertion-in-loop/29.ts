import test from 'node:test';
import assert from 'node:assert/strict';
test('x', async (t) => { await t.test('inner', () => { for (const c of cases) { assert.equal(run(c), 1); } }); });