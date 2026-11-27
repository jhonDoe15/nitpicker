import test from 'node:test';
test('x', (t) => { t.plan(2); t.assert.equal(b, 2); setTimeout(() => t.assert.equal(a, 1)); });