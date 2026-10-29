import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { listNativeRules, withCompileCache, withEngineHint } from './oxlint-process.mjs';

const { temporaryRoot } = useGitFixtures();
const NO_DEBUGGER = {
  scope: 'eslint',
  value: 'no-debugger',
  category: 'correctness',
  type_aware: false,
  fix: 'fixable_suggestion',
  default: true,
  docs_url: 'https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-debugger.html',
};

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

describe('the native oxlint rule listing', () => {
  it('lists the rules from a fresh folder, wherever nitpicker is installed', async () => {
    const parent = temporaryRoot('nitpicker-oxlint-listing-');
    const rules = await listNativeRules(parent);

    expect(rules.find((rule) => rule.value === 'no-debugger' && rule.scope === 'eslint')).toEqual(
      NO_DEBUGGER,
    );
    expect(readdirSync(parent)).toEqual([]);
  });

  it('names the command and what oxlint printed when the listing fails', async () => {
    const root = temporaryRoot('nitpicker-oxlint-ignored-');
    writeFileSync(`${root}/.gitignore`, 'node_modules/\n');
    mkdirSync(`${root}/node_modules`);

    await expect(listNativeRules(`${root}/node_modules`)).rejects.toThrow(
      'oxlint --rules --format json exited with 1: No files found to lint. Please check your paths and ignore patterns.',
    );
  });
});
