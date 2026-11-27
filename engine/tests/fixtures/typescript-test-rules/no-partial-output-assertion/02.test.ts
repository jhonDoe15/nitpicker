import assert from 'node:assert/strict';

assert.ok(output.includes('fragment'));
assert(output.includes('fragment'));
assert.partialDeepStrictEqual(actual, { id: 1 });
assert.match(output, /fragment/u);
assert.deepStrictEqual(output, 'whole');
expect(output).to.include('fragment');
expect(list).to.deep.include({ id: 1 });
expect(list).to.include.members([1, 2]);
expect(output).to.not.include('secret');
