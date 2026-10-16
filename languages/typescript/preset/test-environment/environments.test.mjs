import { describe, expect, it } from 'vitest';
import { environmentsFromConfig } from './environments.mjs';

const projectRoot = '/work/app';

describe('environmentsFromConfig', () => {
  it.each([
    ['an empty config', {}, { environment: 'node', scopes: [] }],
    ['no test options', { test: {} }, { environment: 'node', scopes: [] }],
    ['jsdom', { test: { environment: 'jsdom' } }, { environment: 'jsdom', scopes: [] }],
    ['happy-dom', { test: { environment: 'happy-dom' } }, { environment: 'happy-dom', scopes: [] }],
    [
      'a computed environment',
      { test: { environment: 1 } },
      { environment: undefined, scopes: [] },
    ],
    [
      'browser mode',
      { test: { environment: 'jsdom', browser: { enabled: true } } },
      { environment: undefined, scopes: [] },
    ],
    ['an unreadable config', 'config', { environment: 'node', scopes: [] }],
    [
      'per-file environmentMatchGlobs',
      { test: { environment: 'jsdom', environmentMatchGlobs: [['**/*.node.test.ts', 'node']] } },
      { environment: undefined, scopes: [] },
    ],
    [
      'a test.workspace list',
      { test: { environment: 'jsdom', workspace: [{ test: { environment: 'node' } }] } },
      { environment: undefined, scopes: [] },
    ],
  ])('reads %s', (_name, config, expected) => {
    expect(environmentsFromConfig(config, projectRoot)).toEqual(expected);
  });

  it('resolves setup files against the project and keeps package entries', () => {
    expect(
      environmentsFromConfig(
        {
          test: { environment: 'jsdom', setupFiles: ['./setup.ts', 'test/dom.ts', '@acme/setup'] },
        },
        projectRoot,
      ),
    ).toEqual({
      environment: 'jsdom',
      scopes: [],
      setupFiles: ['/work/app/setup.ts', '/work/app/test/dom.ts', '@acme/setup'],
    });
    expect(
      environmentsFromConfig({ test: { setupFiles: '/abs/setup.ts' } }, projectRoot).setupFiles,
    ).toEqual(['/abs/setup.ts']);
  });

  it('gives a project its own setup files plus the inherited ones', () => {
    const config = {
      test: {
        environment: 'jsdom',
        setupFiles: './root-setup.ts',
        projects: [
          { extends: true, test: { include: ['ui/**/*.test.ts'], setupFiles: ['./ui-setup.ts'] } },
          { root: 'server', test: { include: ['**/*.test.ts'], environment: 'node' } },
        ],
      },
    };
    expect(environmentsFromConfig(config, projectRoot).scopes).toEqual([
      { files: ['server/**/*.test.ts'], ignores: [], environment: 'node' },
      {
        files: ['ui/**/*.test.ts'],
        ignores: [],
        environment: 'jsdom',
        setupFiles: ['/work/app/root-setup.ts', '/work/app/ui-setup.ts'],
      },
    ]);
  });

  it('maps inline projects to scopes and leaves files outside them unknown', () => {
    const config = {
      test: {
        environment: 'jsdom',
        projects: [
          { extends: true, test: { name: 'inherits', include: ['src/ui/**/*.test.tsx'] } },
          { test: { name: 'plain', include: ['src/core/**/*.test.ts'] } },
          {
            test: { name: 'explicit', include: ['src/web/**/*.test.ts'], environment: 'happy-dom' },
          },
          {
            extends: './shared.config.ts',
            test: { name: 'shared', include: ['src/x/**/*.test.ts'] },
          },
          { test: { name: 'default include' } },
          'packages/*',
        ],
      },
    };
    expect(environmentsFromConfig(config, projectRoot)).toEqual({
      environment: undefined,
      scopes: [
        { files: ['src/core/**/*.test.ts'], ignores: [], environment: 'node' },
        { files: ['src/x/**/*.test.ts'], ignores: [], environment: undefined },
        { files: ['src/ui/**/*.test.tsx'], ignores: [], environment: 'jsdom' },
        { files: ['src/web/**/*.test.ts'], ignores: [], environment: 'happy-dom' },
      ],
    });
  });

  it('prefixes a project include and exclude with its dir or root and keeps DOM projects last', () => {
    const config = {
      test: {
        projects: [
          {
            test: {
              dir: 'packages/ui',
              include: ['**/*.test.ts'],
              exclude: ['e2e/**'],
              environment: 'jsdom',
            },
          },
          { root: './packages/api', test: { include: ['./src/**/*.test.ts'] } },
          { test: { root: '/work/app/packages/cli', include: ['*.test.ts'] } },
          { test: { dir: '../elsewhere', include: ['*.test.ts'] } },
        ],
      },
    };
    expect(environmentsFromConfig(config, projectRoot).scopes).toEqual([
      { files: ['packages/api/src/**/*.test.ts'], ignores: [], environment: 'node' },
      { files: ['packages/cli/*.test.ts'], ignores: [], environment: 'node' },
      {
        files: ['packages/ui/**/*.test.ts'],
        ignores: ['packages/ui/e2e/**'],
        environment: 'jsdom',
      },
    ]);
  });
});
