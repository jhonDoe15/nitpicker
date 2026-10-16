import { describe, expect, it } from 'vitest';
import { withEngineHint } from './oxlint-process.mjs';

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
