import { describe, expect, it } from 'vitest';
import { withCompileCache, withEngineHint } from './oxlint-process.mjs';

describe('the engine hint on an oxlint failure', () => {
  it('suggests the ESLint engine when the failure may be the engine', () => {
    expect(withEngineHint('oxlint crashed')).toBe(
      'oxlint crashed\nSet "tools": { "eslint": { "engine": "eslint" } } in nitpicker.config.json to lint with ESLint instead.',
    );
  });

  it('leaves a failure that names the config file alone, since switching engines cannot fix it', () => {
    const detail =
      'oxlint planning failed: nitpicker.config.json "exceptions" name unknown rules: formatjs/enforce-id';

    expect(withEngineHint(detail)).toBe(detail);
  });
});

describe('the oxlint subprocess environment', () => {
  it('reuses compiled modules across the planning and lint processes unless the caller chose a cache', () => {
    expect(withCompileCache({ PATH: '/bin' })).toEqual({
      NODE_COMPILE_CACHE: expect.stringMatching(/nitpicker-node-compile-cache$/u),
      PATH: '/bin',
    });
    expect(withCompileCache({ NODE_COMPILE_CACHE: '/cache' }).NODE_COMPILE_CACHE).toBe('/cache');
  });
});
