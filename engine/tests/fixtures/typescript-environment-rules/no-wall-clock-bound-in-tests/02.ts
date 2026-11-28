import assert from 'node:assert';
const LIMIT = 250;
it('stays quick', () => {
  const before = performance.now();
  work();
  const after = performance.now();
  assert(after - before < LIMIT);
  assert.ok(LIMIT > after - before);
  expect(after - before).to.be.below(100);
});
