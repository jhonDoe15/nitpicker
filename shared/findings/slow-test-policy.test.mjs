import { describe, expect, it } from 'vitest';
import { applyFindingPolicy } from './finding-policy.mjs';

const slow = {
  tool: 'test-runtime',
  rule: 'slow-test',
  path: 'src/test/java/SlowTest.java',
  identity: 'id',
  classification: 'enforceable',
};
const exception = (rule) => ({ exceptions: [{ rule, paths: ['src/test/**'] }] });

describe('applyFindingPolicy slow tests', () => {
  it('lifts a slow test named bare or as printed', () => {
    expect(applyFindingPolicy([slow], exception('slow-test'))).toEqual([]);
    expect(applyFindingPolicy([slow], exception('test-runtime/slow-test'))).toEqual([]);
    expect(applyFindingPolicy([slow], exception('pmd/slow-test'))).toEqual([slow]);
  });
});
