import { describe, expect, it } from 'vitest';
import { resolveHeadPolicy } from '../../../shared/head-policy.mjs';
import {
  FACT_RULE_LANGUAGES,
  FACT_RULE_SETTINGS,
} from '../../../shared/project-rules/fact-rules.mjs';
import { validateConfig } from '../validate.mjs';

describe('layout keys', () => {
  it('accepts entry point globs for files that are loaded by path', () => {
    const layout = { entryPoints: ['tools/*-runner.mjs'] };

    expect(validateConfig({ layout })).toEqual({ layout });
  });

  it('accepts the directory roots and the excluded globs together', () => {
    const layout = {
      sourceRoots: ['lib'],
      testRoots: ['spec'],
      excludedGlobs: ['**/vendor/**', '**/*.generated.ts'],
    };

    expect(validateConfig({ layout })).toEqual({ layout });
  });

  it('validates globs for excludedGlobs and directories for the roots', () => {
    expect(() => validateConfig({ layout: { excludedGlobs: ['**/vendor/**'] } })).not.toThrow();
    expect(() => validateConfig({ layout: { sourceRoots: ['**/vendor/**'] } })).toThrow(
      /entries must be directories inside the project/,
    );
    expect(() => validateConfig({ layout: { excludedGlobs: '**/vendor/**' } })).toThrow(
      /"layout.excludedGlobs" must be an array/,
    );
    expect(() => validateConfig({ layout: { excludedGlobs: [''] } })).toThrow(
      /"layout.excludedGlobs" must be an array of non-empty strings/,
    );
  });

  it('lists every allowed layout key when one is unknown', () => {
    expect(() => validateConfig({ layout: { roots: ['lib'] } })).toThrow(
      /Allowed layout keys: sourceRoots, testRoots, excludedGlobs, entryPoints, sharedRoots, featureRoots/,
    );
  });
});

describe('feature layout keys', () => {
  const layout = { sharedRoots: ['**/common'], featureRoots: ['src/main/java/com/acme/features'] };
  const RULE = 'shared-used-by-one-feature';

  it.each([['typescript'], ['javascript'], ['python'], ['java'], ['kotlin']])(
    'are valid with the %s preset and reach the analyzers',
    (preset) => {
      expect(validateConfig({ preset, layout })).toEqual({ preset, layout });
      expect(resolveHeadPolicy({ preset, layout }).layout).toEqual(layout);
    },
  );

  it('are rejected with a preset whose language runs no rule that reads them', () => {
    const rules = Object.entries(FACT_RULE_SETTINGS)
      .filter(([, settings]) => settings.includes('layout.sharedRoots'))
      .map(([rule]) => rule);
    const before = rules.map((rule) => FACT_RULE_LANGUAGES[rule].java);
    for (const rule of rules) {
      FACT_RULE_LANGUAGES[rule].java = false;
    }
    try {
      expect(() => validateConfig({ preset: 'java', layout })).toThrow(
        `nitpicker.config.json: "layout.sharedRoots" is not supported with "preset": "java": it configures ${RULE}, feature-internal-import, shared-imports-feature, feature-cycle, which the java preset does not run yet. Remove it`,
      );
    } finally {
      for (const [index, rule] of rules.entries()) {
        FACT_RULE_LANGUAGES[rule].java = before[index];
      }
    }
  });

  it('accepts an empty feature list, which turns the rule off', () => {
    expect(() => validateConfig({ layout: { featureRoots: [] } })).not.toThrow();
  });

  it.each([
    [{ sharedRoots: 'shared' }, /"layout.sharedRoots" must be an array/],
    [{ sharedRoots: [''] }, /must be an array of non-empty strings/],
    [{ featureRoots: ['../features'] }, /must be folder globs inside the project/],
    [{ featureRoots: ['/repo/features'] }, /must be folder globs inside the project/],
    [{ sharedRoots: ['C:/shared'] }, /must be folder globs inside the project/],
  ])('rejects %j', (value, message) => {
    expect(() => validateConfig({ preset: 'typescript', layout: value })).toThrow(message);
  });

  it.each([
    ['./shared', 'drop the leading "./": globs match from the project root'],
    ['**/shared/', 'drop the trailing "/": write "**/shared"'],
    [
      '(?i)**/shared',
      'regular expression flags such as (?i) are not supported: globs match case-sensitively, so list each spelling in braces, such as {README,readme}.md',
    ],
    ['**/{shared,common', 'a "{" is never closed'],
  ])('rejects the folder glob %s, which can never match', (glob, problem) => {
    expect(() => validateConfig({ layout: { sharedRoots: [glob] } })).toThrow(
      `nitpicker.config.json: "layout.sharedRoots" glob ${JSON.stringify(glob)} can never match: ${problem}`,
    );
  });

  it('takes a folder glob with brackets, which match themselves', () => {
    const config = { layout: { featureRoots: ['src/app/[locale]/features'] } };

    expect(validateConfig(config)).toEqual(config);
  });

  it.each([
    ['python', 'sharedRoots, featureRoots'],
    ['java', 'sharedRoots, featureRoots'],
    ['kotlin', 'sharedRoots, featureRoots'],
  ])(
    'rejects the TypeScript source folders with the %s preset and names the keys it takes',
    (preset, keys) => {
      expect(() => validateConfig({ preset, layout: { sourceRoots: ['src'] } })).toThrow(
        `"layout.sourceRoots" is not supported with "preset": "${preset}": it describes TypeScript source folders. Layout keys with ${preset}: ${keys}`,
      );
      expect(() => validateConfig({ preset, layout: { roots: ['src'] } })).toThrow(
        `unknown layout key "roots". Allowed layout keys: ${keys}`,
      );
    },
  );
});
