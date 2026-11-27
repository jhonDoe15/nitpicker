import test from 'node:test';
import assert from 'node:assert/strict';
test('x', async (t) => { for (const c of cases) { assert.equal(run(c), 1); } });