import { describe, expect, it } from 'vitest';
import { withCanonicalRules } from './config.mjs';

const exception = (rule) => ({ rule, paths: ['tests/**'], reason: 'real database' });

describe('the printed form of a rule in the exceptions', () => {
  it('reads test-runtime/slow-test as the slow-test every preset prints', () => {
    expect(
      withCanonicalRules({
        preset: 'java',
        exceptions: [exception('test-runtime/slow-test'), exception('pmd/UnusedPrivateField')],
      }),
    ).toEqual({
      preset: 'java',
      exceptions: [exception('slow-test'), exception('pmd/UnusedPrivateField')],
    });
  });

  it('leaves a config without exceptions, and a value that is no config, as it is', () => {
    expect(withCanonicalRules({ preset: 'python' })).toEqual({ preset: 'python' });
    expect(withCanonicalRules([1])).toEqual([1]);
    expect(withCanonicalRules({ exceptions: 'x' })).toEqual({ exceptions: 'x' });
  });
});
