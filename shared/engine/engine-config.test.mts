import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  engineLayoutConfig,
  normalizeEngineRoot,
  typescriptLintArguments,
  writeEngineConfig,
} from './engine-config.mts';

describe('engine layout and config serialization', () => {
  it('normalizes source and test roots to POSIX relative form', () => {
    expect(normalizeEngineRoot('./packages/api/src/')).toBe('packages/api/src');
    expect(normalizeEngineRoot('packages\\web\\src')).toBe('packages/web/src');
    expect(normalizeEngineRoot('./')).toBe('.');
  });

  it('prefers hiddenGlobs over excludedGlobs and normalizes test patterns', () => {
    const config = engineLayoutConfig({
      sourceRoots: ['./packages/api/src/', 'packages\\web\\src'],
      testRoots: ['test', 'integration', 'e2e'],
      colocatedTests: true,
      hiddenGlobs: ['packages/api/src/legacy/**'],
      excludedGlobs: ['dist/**'],
      generatedFiles: ['./packages\\api\\src\\gen.ts'],
      testFiles: {
        include: ['./**/*.test.ts', 'integration/**/*.ts'],
        exclude: ['./**/*.fixture.ts'],
      },
    });
    expect(config).toEqual({
      sourceRoots: ['packages/api/src', 'packages/web/src'],
      testRoots: ['test', 'integration', 'e2e'],
      extensions: ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'],
      colocatedTests: true,
      excludedGlobs: ['packages/api/src/legacy/**'],
      generatedFiles: ['packages/api/src/gen.ts'],
      testPatterns: {
        include: ['**/*.test.ts', 'integration/**/*.ts'],
        exclude: ['**/*.fixture.ts'],
        includeRegexes: [],
        excludeRegexes: [],
      },
    });
  });

  it('writes JSON config and builds shared typescript-lint arguments', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-engine-config-'));
    try {
      const configPath = writeEngineConfig(path.join(directory, 'config.json'), {
        projectRoot: '/workspace/app',
        rules: { 'report-module-load-effects': { commonJsExports: true } },
      });
      const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
      expect(parsed).toEqual({
        projectRoot: '/workspace/app',
        rules: { 'report-module-load-effects': { commonJsExports: true } },
      });
      expect(
        typescriptLintArguments({
          files: '/tmp/files.tsv',
          config: configPath,
          rules: ['no-copied-constant', 'report-module-load-effects'],
          out: '/tmp/out.json',
          extra: ['--testing-library-scope'],
        }),
      ).toEqual([
        'typescript-lint',
        '--files',
        '/tmp/files.tsv',
        '--config',
        configPath,
        '--rules',
        'no-copied-constant,report-module-load-effects',
        '--out',
        '/tmp/out.json',
        '--testing-library-scope',
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
