import { describe, expect, it } from 'vitest';
import { resolveTestTimeouts } from './resolve.mjs';
import { validateConfig } from '../../core/configuration/validate.mjs';

describe('test timeout policy', () => {
  it('preserves execution grace separately from declaration ceilings and native hooks', () => {
    expect(resolveTestTimeouts()).toEqual({
      language: 'typescript',
      testTimeoutMs: 40_000,
      hookTimeoutMs: undefined,
      testDeclarationCeilingMs: 10_000,
      hookDeclarationCeilingMs: 10_000,
    });
    expect(resolveTestTimeouts({ thresholds: { integrationTestSeconds: 45 } }).testTimeoutMs).toBe(
      55_000,
    );
  });

  it('inherits each field through subject language, repository defaults and one named suite', () => {
    const config = {
      preset: 'typescript',
      tools: {
        tests: {
          timeouts: {
            languages: { java: { testTimeoutMs: 120_000, hookDeclarationCeilingMs: 300_000 } },
            defaults: { testTimeoutMs: 130_000, testDeclarationCeilingMs: 90_000 },
            projects: {
              'java-e2e': {
                language: 'java',
                include: ['jvm/**/*.e2e.test.mjs'],
                testTimeoutMs: 180_000,
              },
            },
          },
        },
      },
    };
    expect(resolveTestTimeouts(config, { file: 'jvm/compile.e2e.test.mjs' })).toEqual({
      project: 'java-e2e',
      language: 'java',
      testTimeoutMs: 180_000,
      hookTimeoutMs: undefined,
      testDeclarationCeilingMs: 90_000,
      hookDeclarationCeilingMs: 300_000,
    });
    expect(resolveTestTimeouts(config, { project: 'java-e2e' }).language).toBe('java');
    expect(
      resolveTestTimeouts(config, { file: 'src/check.test.mjs' }).hookDeclarationCeilingMs,
    ).toBe(10_000);
  });

  it('validates named finite budgets through the existing project config', () => {
    const config = {
      tools: {
        tests: {
          timeouts: {
            projects: {
              jvm: {
                language: 'java',
                include: ['jvm/**/*.mjs'],
                testTimeoutMs: 180_000,
              },
            },
          },
        },
      },
    };
    expect(validateConfig(config)).toEqual(config);
    expect(() =>
      validateConfig({
        tools: { tests: { timeouts: { projects: { jvm: { language: 'java', include: [] } } } } },
      }),
    ).toThrow('at least one');
    expect(() =>
      validateConfig({ tools: { tests: { timeouts: { languages: { rust: {} } } } } }),
    ).toThrow('language');
    expect(() =>
      validateConfig({ tools: { tests: { timeouts: { defaults: { testMs: 500 } } } } }),
    ).toThrow('unknown');
  });

  it.each([0, -1, 0.5, Infinity, '300'])('rejects the default test timeout %j', (value) => {
    expect(() =>
      validateConfig({ tools: { tests: { timeouts: { defaults: { testTimeoutMs: value } } } } }),
    ).toThrow('positive integer');
  });

  it('rejects ambiguous membership and mismatched explicit projects instead of taking a larger budget', () => {
    const project = { language: 'java', include: ['jvm/**'], testTimeoutMs: 180_000 };
    const config = {
      tools: { tests: { timeouts: { projects: { first: project, second: project } } } },
    };
    expect(() => resolveTestTimeouts(config, { file: 'jvm/check.test.mjs' })).toThrow(
      'multiple timeout projects',
    );
    expect(() => resolveTestTimeouts(config, { project: 'toString' })).toThrow(
      'unknown timeout project',
    );
    expect(() =>
      resolveTestTimeouts(config, { project: 'first', file: 'unit/check.test.mjs' }),
    ).toThrow('does not belong');
  });
});
