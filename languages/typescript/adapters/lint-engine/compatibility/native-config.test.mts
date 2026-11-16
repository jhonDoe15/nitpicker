import { describe, expect, it } from 'vitest';
import { nativeConfigFlags } from './native-config.mts';

describe('nativeConfigFlags', () => {
  it.each([
    ['eslint-wrapper.config.mts', { typescript: 'strip' }, ['unstable_native_nodejs_ts_config']],
    ['eslint-wrapper.config.mjs', { typescript: 'strip' }, []],
    ['eslint-wrapper.config.mts', {}, []],
  ])('asks ESLint to import %s natively when Node strips types: %j', (file, features, flags) => {
    expect(nativeConfigFlags(file, features)).toEqual(flags);
  });
});
