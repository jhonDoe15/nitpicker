import test from 'node:test';
import assert from 'node:assert/strict';
test('x', (t) => { for (const c of [1, 2]) { t.assert.equal(run(c), 1); } });