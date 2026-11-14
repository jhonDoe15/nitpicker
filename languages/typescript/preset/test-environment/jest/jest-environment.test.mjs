import { describe, expect, it } from 'vitest';
import { environmentsFromJestConfig } from './jest-environment.mjs';

const ROOT = '/repo';

function project(overrides = {}) {
  return { rootDir: ROOT, testEnvironment: 'node', testMatch: ['**/*.test.js'], ...overrides };
}

describe('environments from a resolved Jest configuration', () => {
  it.each([
    ['node', 'node'],
    ['jsdom', 'jsdom'],
    ['/repo/node_modules/jest-environment-jsdom/build/index.js', 'jsdom'],
    ['/repo/node_modules/jest-environment-node/build/index.js', 'node'],
    ['jest-environment-happy-dom', 'happy-dom'],
    ['@happy-dom/jest-environment', 'happy-dom'],
  ])('reads testEnvironment %s as %s', (testEnvironment, expected) => {
    const result = environmentsFromJestConfig({ configs: [project({ testEnvironment })] }, ROOT);

    expect(result.environment).toBe(expected);
    expect(result.scopes).toEqual([]);
  });

  it('leaves an unrecognised environment undefined', () => {
    const result = environmentsFromJestConfig(
      { configs: [project({ testEnvironment: './custom-environment.js' })] },
      ROOT,
    );

    expect(result.environment).toBeUndefined();
  });

  it('treats a missing configuration as no information', () => {
    expect(environmentsFromJestConfig(undefined, ROOT)).toEqual({
      environment: undefined,
      scopes: [],
      aliases: [],
    });
  });

  it('keeps the setup files of a single project', () => {
    const result = environmentsFromJestConfig(
      {
        configs: [project({ setupFiles: ['/repo/a.js', 7], setupFilesAfterEnv: ['/repo/b.js'] })],
      },
      ROOT,
    );

    expect(result.setupFiles).toEqual(['/repo/a.js', '/repo/b.js']);
  });

  it('turns moduleNameMapper into aliases, once per distinct mapping', () => {
    const mapper = [
      ['^@app/(.*)$', ['/repo/src/$1']],
      ['^x$', 3],
    ];
    const result = environmentsFromJestConfig(
      { configs: [project({ moduleNameMapper: mapper }), project({ moduleNameMapper: mapper })] },
      ROOT,
    );

    expect(result.aliases).toEqual([
      { find: { pattern: '^@app/(.*)$', flags: '' }, replacement: '/repo/src/$1' },
    ]);
  });

  it('scopes a multi-project configuration by each project testMatch, DOM last', () => {
    const result = environmentsFromJestConfig(
      {
        configs: [
          project({ testEnvironment: 'jsdom', rootDir: '/repo/web', testMatch: ['**/*.spec.js'] }),
          project({ testEnvironment: 'node', testMatch: ['api/**/*.test.js'] }),
        ],
      },
      ROOT,
    );

    expect(result.environment).toBeUndefined();
    expect(result.scopes.map(({ environment }) => environment)).toEqual(['node', 'jsdom']);
    expect(result.scopes[1].files).toEqual(['web/**/*.spec.js']);
  });

  it('makes an absolute testMatch relative to the project', () => {
    const result = environmentsFromJestConfig(
      {
        configs: [
          project({ testMatch: ['/repo/tests/*.js'] }),
          project({ testMatch: ['**/*.x.js'] }),
        ],
      },
      ROOT,
    );

    expect(result.scopes[0].files).toEqual(['tests/*.js']);
  });

  it.each([
    ['a project outside the checkout', { rootDir: '/elsewhere' }],
    ['a testRegex project', { testRegex: ['.*\\.test\\.js$'] }],
    ['a project without testMatch', { testMatch: [] }],
  ])('drops %s from the scopes', (_name, overrides) => {
    const result = environmentsFromJestConfig(
      { configs: [project(overrides), project({ testEnvironment: 'jsdom' })] },
      ROOT,
    );

    expect(result.scopes.map(({ environment }) => environment)).toEqual(['jsdom']);
  });

  it('carries setup files into the project scope', () => {
    const result = environmentsFromJestConfig(
      {
        configs: [project({ setupFilesAfterEnv: ['/repo/setup.js'] }), project()],
      },
      ROOT,
    );

    expect(result.scopes[0].setupFiles).toEqual(['/repo/setup.js']);
  });
});
