import { describe, expect, it } from 'vitest';
import { applyJavaPolicy } from './java-policy.mjs';

const slow = {
  tool: 'test-runtime',
  rule: 'slow-test',
  path: 'src/test/java/SlowTest.java',
  identity: 'id',
  classification: 'enforceable',
};
const exception = (rule) => ({ exceptions: [{ rule, glob: 'src/test/**' }] });

describe('applyJavaPolicy slow tests', () => {
  it('lifts a slow test named bare or as printed', () => {
    expect(applyJavaPolicy([slow], exception('slow-test'))).toEqual([]);
    expect(applyJavaPolicy([slow], exception('test-runtime/slow-test'))).toEqual([]);
    expect(applyJavaPolicy([slow], exception('pmd/slow-test'))).toEqual([slow]);
  });
});
