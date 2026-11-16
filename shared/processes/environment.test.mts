import { describe, expect, it } from 'vitest';
import { withCompileCache } from './environment.mts';

const CACHE_DIRECTORY: unknown = expect.stringMatching(/nitpicker-node-compile-cache$/u);

describe('the subprocess environment', () => {
  it('reuses compiled modules across tool processes unless the caller chose a cache', () => {
    expect(withCompileCache({ PATH: '/bin' })).toEqual({
      NODE_COMPILE_CACHE: CACHE_DIRECTORY,
      PATH: '/bin',
    });
    expect(withCompileCache({ NODE_COMPILE_CACHE: '/cache' })['NODE_COMPILE_CACHE']).toBe('/cache');
  });
});
