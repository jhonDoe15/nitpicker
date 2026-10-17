import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { greet, totalLength } from '../src/main/features/greeting/index.js';

describe('greeting', () => {
  it('greets a trimmed name', () => {
    assert.deepStrictEqual(greet('  Ada '), { kind: 'greeted', text: 'Hello, Ada!' });
  });

  it('reports an empty name', () => {
    assert.deepStrictEqual(greet('   '), { kind: 'empty-name' });
  });

  it('sums name lengths with reduce and an initial value', () => {
    assert.strictEqual(totalLength(['Ada', 'Bo']), 5);
    assert.strictEqual(totalLength([]), 0);
  });
});
