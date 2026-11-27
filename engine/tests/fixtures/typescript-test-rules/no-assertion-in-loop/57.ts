import test from 'node:test';
import assert from 'node:assert/strict';
test('cases', async (t) => { for (const c of [{ name: 'a', input: 1, output: 1 }]) { await t.test(c.name, () => { assert.equal(run(c.input), c.output); }); } });