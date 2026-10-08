// Strict-preset boundary rules for dependency-cruiser. Not part of the default config: the preset
// enables them by spreading `strictBoundaryRules` into `forbidden`. Each rule's `comment` is printed
// with the violation and names the allowed form.
import { sourceRoot } from '../layout.mjs';
import { layoutFeatures } from './strict-layout.mjs';

const { featureRoot, feature, shared, compositionRoot } = layoutFeatures;
const codeFile = '\\.[cm]?[jt]sx?$';

const pureNodeModules = ['path', 'url', 'util', 'assert', 'buffer', 'events', 'string_decoder'];
const networkAndDatabaseClients = [
  'axios',
  'node-fetch',
  'undici',
  'got',
  'ky',
  'ws',
  'pg',
  'mysql',
  'mysql2',
  'mongodb',
  'mongoose',
  'redis',
  'ioredis',
  'sqlite3',
  'better-sqlite3',
  'knex',
  'sequelize',
  'typeorm',
  'drizzle-orm',
  '@prisma/client',
  '@aws-sdk/[^/]+',
];
const loggers = ['pino', 'winston', 'bunyan', 'log4js', 'loglevel', 'consola', 'debug'];

const domain = { path: `${feature}/domain/` };

export const strictBoundaryRules = [
  {
    name: 'feature-internals-only-through-index',
    severity: 'error',
    comment:
      'Import a feature only through its public index.ts (src/main/features/<name>/index.ts), not its internal files.',
    from: { path: `(?:^|/)${sourceRoot}/`, pathNot: `${featureRoot}/` },
    to: { path: `${featureRoot}/[^/]+/(?!index${codeFile})` },
  },
  {
    name: 'features-do-not-import-other-feature-internals',
    severity: 'error',
    comment:
      'Import another feature only through its public index.ts (src/main/features/<name>/index.ts), not its internal files.',
    from: { path: `${featureRoot}/([^/]+)/` },
    to: {
      path: `${featureRoot}/[^/]+/(?!index${codeFile})`,
      pathNot: `${featureRoot}/$1/`,
    },
  },
  {
    name: 'shared-does-not-import-features',
    severity: 'error',
    comment:
      'Shared code does not import features. Move the dependency into the feature, or pass it in as a parameter from the composition root.',
    from: { path: shared },
    to: { path: featureRoot },
  },
  {
    name: 'features-do-not-import-composition-root',
    severity: 'error',
    comment:
      'Features do not import the composition root. Accept the dependency as a parameter; only the composition root wires features together.',
    from: { path: featureRoot },
    to: { path: compositionRoot },
  },
  {
    name: 'domain-does-not-import-adapters',
    severity: 'error',
    comment:
      'domain/ stays pure and may not import adapters/. Define the dependency as a type in domain/ and let adapters/ implement it.',
    from: domain,
    to: { path: `${feature}/adapters/` },
  },
  {
    name: 'domain-does-not-import-node-io',
    severity: 'error',
    comment:
      'domain/ may import only pure Node modules (path, url, util, assert, buffer, events, string_decoder). Do the I/O in adapters/ and pass the result in as a parameter.',
    from: domain,
    to: {
      dependencyTypes: ['core'],
      pathNot: `^(?:node:)?(?:${pureNodeModules.join('|')})$`,
    },
  },
  {
    name: 'domain-does-not-import-network-or-database-clients',
    severity: 'error',
    comment:
      'domain/ may not import network or database clients. Call the client from adapters/ and pass the data into domain/ as a parameter.',
    from: domain,
    to: { path: `(?:^|/)(?:node_modules/)?(?:${networkAndDatabaseClients.join('|')})(?:/|$)` },
  },
  {
    name: 'domain-does-not-import-the-logger',
    severity: 'error',
    comment:
      'domain/ may not import the logger. Return a result describing what happened and let adapters/ log it.',
    from: domain,
    to: {
      path: [
        `(?:^|/)(?:node_modules/)?(?:${loggers.join('|')})(?:/|$)`,
        `(?:^|/)(?:logger|logging|log)(?:/index)?${codeFile}`,
        '(?:^|/)(?:logger|logging)/',
      ],
    },
  },
  {
    name: 'domain-does-not-import-module-state',
    severity: 'error',
    comment:
      'domain/ may not import module state (state/, *-state, *-store files). Receive the state as a parameter and return the new value.',
    from: domain,
    to: {
      path: [`(?:^|/)state/`, `(?:^|/)[^/]*[.-](?:state|store)${codeFile}`],
    },
  },
];
