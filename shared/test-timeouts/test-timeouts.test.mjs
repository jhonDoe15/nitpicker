import { describe, expect, it } from 'vitest';
import {
  INTEGRATION_HOOK_TIMEOUT_MS,
  INTEGRATION_TEST_TIMEOUT_MS,
  TEST_TIMEOUT_CEILING_MS,
  resolveTestTimeouts,
} from './resolve.mjs';
import { validateConfig } from '../../core/configuration/validate.mjs';

describe('test timeout policy', () => {
  it('preserves execution grace separately from declaration ceilings and native hooks', () => {
    expect(resolveTestTimeouts()).toEqual({
      language: 'typescript',
      testTimeoutMs: 40_000,
      hookTimeoutMs: undefined,
      testDeclarationCeilingMs: TEST_TIMEOUT_CEILING_MS,
      hookDeclarationCeilingMs: TEST_TIMEOUT_CEILING_MS,
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
            languages: {
              java: {
                testTimeoutMs: 120_000,
                hookDeclarationCeilingMs: INTEGRATION_HOOK_TIMEOUT_MS,
              },
            },
            defaults: { testTimeoutMs: 130_000, testDeclarationCeilingMs: 90_000 },
            projects: {
              'java-e2e': {
                language: 'java',
                include: ['jvm/**/*.e2e.test.mjs'],
                testTimeoutMs: INTEGRATION_TEST_TIMEOUT_MS,
              },
            },
          },
        },
      },
    };
    expect(resolveTestTimeouts(config, { file: 'jvm/compile.e2e.test.mjs' })).toEqual({
      project: 'java-e2e',
      language: 'java',
      testTimeoutMs: INTEGRATION_TEST_TIMEOUT_MS,
      hookTimeoutMs: undefined,
      testDeclarationCeilingMs: 90_000,
      hookDeclarationCeilingMs: INTEGRATION_HOOK_TIMEOUT_MS,
    });
    expect(resolveTestTimeouts(config, { project: 'java-e2e' }).language).toBe('java');
    expect(
      resolveTestTimeouts(config, { file: 'src/check.test.mjs' }).hookDeclarationCeilingMs,
    ).toBe(TEST_TIMEOUT_CEILING_MS);
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
                testTimeoutMs: INTEGRATION_TEST_TIMEOUT_MS,
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
    const project = {
      language: 'java',
      include: ['jvm/**'],
      testTimeoutMs: INTEGRATION_TEST_TIMEOUT_MS,
    };
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

  it('raises the limits of integration and end-to-end tests to the integration floor only', () => {
    expect(resolveTestTimeouts({}, { integration: true })).toEqual({
      language: 'typescript',
      testTimeoutMs: INTEGRATION_TEST_TIMEOUT_MS,
      hookTimeoutMs: INTEGRATION_HOOK_TIMEOUT_MS,
      testDeclarationCeilingMs: INTEGRATION_TEST_TIMEOUT_MS,
      hookDeclarationCeilingMs: INTEGRATION_HOOK_TIMEOUT_MS,
    });
    expect(resolveTestTimeouts({}, { integration: false }).testDeclarationCeilingMs).toBe(
      TEST_TIMEOUT_CEILING_MS,
    );
    expect(resolveTestTimeouts({}).hookDeclarationCeilingMs).toBe(TEST_TIMEOUT_CEILING_MS);
  });

  it('lets repository defaults raise the floor but never lower it, and a project set both', () => {
    const defaults = { testTimeoutMs: 30_000, hookTimeoutMs: 600_000 };
    const config = {
      tools: {
        tests: {
          timeouts: {
            defaults,
            projects: { slow: { language: 'java', include: ['jvm/**'], testTimeoutMs: 20_000 } },
          },
        },
      },
    };

    expect(resolveTestTimeouts(config, { integration: true })).toEqual({
      language: 'typescript',
      testTimeoutMs: INTEGRATION_TEST_TIMEOUT_MS,
      hookTimeoutMs: 600_000,
      testDeclarationCeilingMs: INTEGRATION_TEST_TIMEOUT_MS,
      hookDeclarationCeilingMs: INTEGRATION_HOOK_TIMEOUT_MS,
    });
    expect(resolveTestTimeouts(config, { integration: false })).toEqual({
      language: 'typescript',
      testTimeoutMs: 30_000,
      hookTimeoutMs: 600_000,
      testDeclarationCeilingMs: TEST_TIMEOUT_CEILING_MS,
      hookDeclarationCeilingMs: TEST_TIMEOUT_CEILING_MS,
    });
    expect(resolveTestTimeouts(config, { file: 'jvm/a.test.mjs', integration: true })).toEqual({
      project: 'slow',
      language: 'java',
      testTimeoutMs: 20_000,
      hookTimeoutMs: 600_000,
      testDeclarationCeilingMs: INTEGRATION_TEST_TIMEOUT_MS,
      hookDeclarationCeilingMs: INTEGRATION_HOOK_TIMEOUT_MS,
    });
  });
});
