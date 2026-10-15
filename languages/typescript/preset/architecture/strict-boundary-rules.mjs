import { globToRegExpSource } from '../../../../shared/glob.mjs';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { layoutFeatures } from './strict-layout.mjs';

const layout = readLayout();
const sourceRoot = `(?:${layout.sourceRoots.join('|')})`;

export function publicIndexFor({ javascript }) {
  return javascript
    ? 'public index.js or index.mjs (src/main/features/<name>/index.js)'
    : 'public index.ts (src/main/features/<name>/index.ts)';
}

const publicIndex = publicIndexFor(layout);

const { featureRoot, feature, shared, compositionRoot } = layoutFeatures;
const codeFile = '\\.[cm]?[jt]sx?$';

const EXCEPTION_ROUTE =
  ' If it is deliberate, add an exception for this rule in nitpicker.config.json (paths are the importing files).';

const pureNodeModules = [
  'path',
  'url',
  'util',
  'assert',
  'buffer',
  'events',
  'string_decoder',
  'punycode',
  'querystring',
];
const idAndRandomLibraries = [
  'uuid',
  'nanoid',
  'cuid',
  '@paralleldrive/cuid2',
  'ulid',
  '@faker-js/faker',
  'faker',
];
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

const pureNodeModulePattern = `^(?:node:)?(?:${pureNodeModules.join('|')})(?:/(?:posix|win32|strict|types))?$`;

const nodeIoModules = [
  'fs',
  'child_process',
  'net',
  'http',
  'https',
  'http2',
  'tls',
  'dgram',
  'dns',
  'cluster',
  'worker_threads',
  'os',
  'readline',
  'crypto',
  'perf_hooks',
  'timers',
  'zlib',
];

const reachableIoPatterns = [
  `^(?:node:)?(?:${nodeIoModules.join('|')})(?:$|/)`,
  `(?:^|/)node_modules/(?:${[...networkAndDatabaseClients, ...loggers].join('|')})(?:/|$)`,
];

const domain = { path: `${feature}/domain/` };

const baseBoundaryRules = [
  {
    name: 'feature-internals-only-through-index',
    severity: 'error',
    comment: `Import a feature only through its ${publicIndex}, not its internal files.`,
    from: { path: `(?:^|/)${sourceRoot}/`, pathNot: `${featureRoot}/` },
    to: { path: `${featureRoot}/[^/]+/(?!index${codeFile})` },
  },
  {
    name: 'features-do-not-import-other-feature-internals',
    severity: 'error',
    comment: `Import another feature only through its ${publicIndex}, not its internal files.`,
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
      'domain/ may import only pure Node modules (path, url, util, assert, buffer, events, string_decoder, punycode, querystring, and their subpaths such as path/posix). Do the I/O in adapters/ and pass the result in as a parameter.',
    from: domain,
    to: {
      dependencyTypes: ['core'],
      pathNot: pureNodeModulePattern,
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
  {
    name: 'domain-does-not-import-id-libraries',
    severity: 'error',
    comment:
      'domain/ may not import ID or random-data libraries (uuid, nanoid, cuid, ulid, faker). Take the ID as a parameter from adapters/.',
    from: domain,
    to: { path: `(?:^|/)(?:node_modules/)?(?:${idAndRandomLibraries.join('|')})(?:/|$)` },
  },
  {
    name: 'domain-does-not-reach-io-through-shared',
    severity: 'error',
    comment:
      'domain/ reaches Node I/O or a client through a shared/ module it imports. Move that dependency out of the shared module, or do the work in adapters/ and pass the result into domain/ as a parameter.',
    from: domain,
    to: { path: reachableIoPatterns, reachable: true },
  },
];

function withExceptionRoute(rule) {
  return rule.name.startsWith('domain-')
    ? { ...rule, comment: `${rule.comment}${EXCEPTION_ROUTE}` }
    : rule;
}

function withExceptions(rule, exceptions) {
  const lifted = exceptions
    .filter((exception) => exception.rule === rule.name)
    .flatMap(({ paths }) => paths.map(globToRegExpSource));
  if (lifted.length === 0) {
    return rule;
  }
  const existing = [rule.from.pathNot ?? []].flat();
  return { ...rule, from: { ...rule.from, pathNot: [...existing, ...lifted] } };
}

export function strictBoundaryRulesFor(exceptions) {
  return baseBoundaryRules.map(withExceptionRoute).map((rule) => withExceptions(rule, exceptions));
}

export const strictBoundaryRules = strictBoundaryRulesFor(readHeadPolicy().exceptions);
