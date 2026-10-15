import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cruiseWithConfig } from './test-support/strict-cruise.mjs';
import config from './fixtures/dependency-cruiser.fixture.config.mjs';
import productionConfig from '../defaults/dependency-cruiser.config.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function cruiseFixture(name) {
  const fixture = path.join(projectRoot, 'languages/typescript/preset/architecture/fixtures', name);
  return cruiseWithConfig(config, {
    baseDir: fixture,
    paths: ['src', 'tests'].filter((entry) => existsSync(path.join(fixture, entry))),
    outputType: 'err-long',
  });
}

describe('dependency architecture rules', () => {
  it('runs the fixtures against every rule of the shipped dependency-cruiser config', () => {
    expect(productionConfig.forbidden.length).toBeGreaterThan(0);
    expect(config.forbidden).toEqual([
      {
        name: 'no-production-to-test',
        severity: 'error',
        from: { path: '(?:^|/)(?:src)/(?!.*(?:__tests__|\\.test\\.|\\.spec\\.))' },
        to: {
          path: '(?:^|/)(?:(?:test|tests)/|(?:src)/.*/__tests__/|(?:src)/.*\\.(?:test|spec)\\.)',
        },
      },
      {
        name: 'no-production-cycles',
        severity: 'error',
        from: { path: '(?:^|/)(?:src)/(?!.*(?:__tests__|\\.test\\.|\\.spec\\.))' },
        to: { circular: true },
      },
      {
        name: 'no-import-outside-roots',
        severity: 'error',
        from: { path: '(?:^|/)(?:src)/(?!.*(?:__tests__|\\.test\\.|\\.spec\\.))' },
        to: {
          dependencyTypesNot: [
            'core',
            'npm',
            'npm-dev',
            'npm-optional',
            'npm-peer',
            'npm-bundled',
            'npm-no-pkg',
            'npm-unknown',
            'unknown',
            'undetermined',
          ],
          pathNot: '^(?:src|test|tests)/|(?:^|/)node_modules/|^generated/|\\.json$',
        },
      },
      {
        name: 'feature-internals-only-through-index',
        severity: 'error',
        comment:
          'Import a feature only through its public index.ts (src/main/features/<name>/index.ts), not its internal files.',
        from: { path: '(?:^|/)(?:src)/', pathNot: '(?:^|/)(?:src)/main/features/' },
        to: { path: '(?:^|/)(?:src)/main/features/[^/]+/(?!index\\.[cm]?[jt]sx?$)' },
      },
      {
        name: 'features-do-not-import-other-feature-internals',
        severity: 'error',
        comment:
          'Import another feature only through its public index.ts (src/main/features/<name>/index.ts), not its internal files.',
        from: { path: '(?:^|/)(?:src)/main/features/([^/]+)/' },
        to: {
          path: '(?:^|/)(?:src)/main/features/[^/]+/(?!index\\.[cm]?[jt]sx?$)',
          pathNot: '(?:^|/)(?:src)/main/features/$1/',
        },
      },
      {
        name: 'shared-does-not-import-features',
        severity: 'error',
        comment:
          'Shared code does not import features. Move the dependency into the feature, or pass it in as a parameter from the composition root.',
        from: { path: '(?:^|/)(?:src)/main/shared/' },
        to: { path: '(?:^|/)(?:src)/main/features' },
      },
      {
        name: 'features-do-not-import-composition-root',
        severity: 'error',
        comment:
          'Features do not import the composition root. Accept the dependency as a parameter; only the composition root wires features together.',
        from: { path: '(?:^|/)(?:src)/main/features' },
        to: { path: '(?:^|/)(?:src)/main/composition-root(?:\\.[cm]?[jt]sx?$|/)' },
      },
      {
        name: 'domain-does-not-import-adapters',
        severity: 'error',
        comment:
          'domain/ stays pure and may not import adapters/. Define the dependency as a type in domain/ and let adapters/ implement it.',
        from: { path: '(?:^|/)(?:src)/main/features/[^/]+/domain/' },
        to: { path: '(?:^|/)(?:src)/main/features/[^/]+/adapters/' },
      },
      {
        name: 'domain-does-not-import-node-io',
        severity: 'error',
        comment:
          'domain/ may import only pure Node modules (path, url, util, assert, buffer, events, string_decoder). Do the I/O in adapters/ and pass the result in as a parameter.',
        from: { path: '(?:^|/)(?:src)/main/features/[^/]+/domain/' },
        to: {
          dependencyTypes: ['core'],
          pathNot: '^(?:node:)?(?:path|url|util|assert|buffer|events|string_decoder)$',
        },
      },
      {
        name: 'domain-does-not-import-network-or-database-clients',
        severity: 'error',
        comment:
          'domain/ may not import network or database clients. Call the client from adapters/ and pass the data into domain/ as a parameter.',
        from: { path: '(?:^|/)(?:src)/main/features/[^/]+/domain/' },
        to: {
          path: '(?:^|/)(?:node_modules/)?(?:axios|node-fetch|undici|got|ky|ws|pg|mysql|mysql2|mongodb|mongoose|redis|ioredis|sqlite3|better-sqlite3|knex|sequelize|typeorm|drizzle-orm|@prisma/client|@aws-sdk/[^/]+)(?:/|$)',
        },
      },
      {
        name: 'domain-does-not-import-the-logger',
        severity: 'error',
        comment:
          'domain/ may not import the logger. Return a result describing what happened and let adapters/ log it.',
        from: { path: '(?:^|/)(?:src)/main/features/[^/]+/domain/' },
        to: {
          path: [
            '(?:^|/)(?:node_modules/)?(?:pino|winston|bunyan|log4js|loglevel|consola|debug)(?:/|$)',
            '(?:^|/)(?:logger|logging|log)(?:/index)?\\.[cm]?[jt]sx?$',
            '(?:^|/)(?:logger|logging)/',
          ],
        },
      },
      {
        name: 'domain-does-not-import-module-state',
        severity: 'error',
        comment:
          'domain/ may not import module state (state/, *-state, *-store files). Receive the state as a parameter and return the new value.',
        from: { path: '(?:^|/)(?:src)/main/features/[^/]+/domain/' },
        to: { path: ['(?:^|/)state/', '(?:^|/)[^/]*[.-](?:state|store)\\.[cm]?[jt]sx?$'] },
      },
      {
        name: 'features-do-not-import-bootstrap',
        severity: 'error',
        from: { path: '(?:^|/)src/main/[^/]+/' },
        to: { path: '(?:^|/)src/main/server\\.ts$' },
      },
    ]);
  });

  it('accepts the allowed dependency direction', async () => {
    const result = await cruiseFixture('allowed-direction');

    expect(result.exitCode, result.output).toBe(0);
  });

  it('rejects the reverse dependency direction', async () => {
    const result = await cruiseFixture('reverse-direction');

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toEqual(
      '\n  error features-do-not-import-bootstrap: src/main/auth/logic.ts → src/main/server.ts\n    -\n\n\nx 1 dependency violations (1 errors, 0 warnings). 2 modules, 1 dependencies cruised.\n\n',
    );
  });
});
