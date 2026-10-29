const DATABASE = 'database';
const REMOTE = 'remote';
const MESSAGE = 'message';

const DATABASE_PACKAGES = new Set([
  'pg',
  'pg-pool',
  'pg-promise',
  'postgres',
  'mysql',
  'mysql2',
  'mysql2/promise',
  'mariadb',
  'mongodb',
  'mongoose',
  'redis',
  '@redis/client',
  'ioredis',
  'typeorm',
  'sequelize',
  'sequelize-typescript',
  'knex',
  'kysely',
  'objection',
  'drizzle-orm',
  '@prisma/client',
  '.prisma/client',
  '@aws-sdk/client-dynamodb',
  '@aws-sdk/lib-dynamodb',
  '@neondatabase/serverless',
  '@planetscale/database',
  '@libsql/client',
  'cassandra-driver',
  '@google-cloud/firestore',
  '@google-cloud/datastore',
  '@google-cloud/spanner',
  '@elastic/elasticsearch',
]);
const DATABASE_SCOPES = ['@mikro-orm/', 'drizzle-orm/'];
const BUILDER_PACKAGES = new Set(['knex', 'mongoose', 'kysely', 'objection', 'drizzle-orm']);
const CACHE_PACKAGES = new Set(['redis', '@redis/client', 'ioredis']);
const SYNC_DATABASE_PACKAGES = new Set(['better-sqlite3', 'sqlite3', 'node:sqlite']);
const SYNC_DATABASE_CALLS = new Set(['get', 'all', 'run', 'iterate', 'exec', 'pragma', 'each']);

const REMOTE_PACKAGES = new Set([
  'axios',
  'got',
  'undici',
  'undici-types',
  'node-fetch',
  'cross-fetch',
  'ky',
  'superagent',
  'needle',
  '@grpc/grpc-js',
  'stripe',
  'googleapis',
]);
const REMOTE_SCOPES = ['@aws-sdk/', '@google-cloud/', '@azure/'];
const REQUESTS = new Set(['request', 'get']);
const CONNECT = 'connect';
const BUILT_IN_CALLS = new Map([
  ['http', REQUESTS],
  ['https', REQUESTS],
  ['http2', new Set([CONNECT, 'request'])],
  ['net', new Set([CONNECT, 'createConnection'])],
  ['tls', new Set([CONNECT])],
  ['dns', new Set(['lookup', 'lookupService', 'reverse'])],
  ['dns/promises', new Set(['lookup', 'lookupService', 'reverse'])],
]);

const PUBLISH_METHOD = 'publish';
const PUBLISH = new Set([PUBLISH_METHOD, 'publishMessage', 'publishJSON']);
const AMQP_PUBLISH = new Set([PUBLISH_METHOD, 'sendToQueue']);
const MESSAGE_PACKAGES = new Map([
  ['kafkajs', new Set(['send', 'sendBatch'])],
  ['amqplib', AMQP_PUBLISH],
  ['amqp-connection-manager', AMQP_PUBLISH],
  ['@google-cloud/pubsub', PUBLISH],
  ['nats', new Set([PUBLISH_METHOD])],
  ['bullmq', new Set(['add', 'addBulk'])],
  ['bull', new Set(['add', 'addBulk'])],
  ['bee-queue', new Set(['createJob'])],
  ['@azure/service-bus', new Set(['sendMessages', 'scheduleMessages'])],
]);
const BROKER_CLIENTS = new Map([
  [
    '@aws-sdk/client-sqs',
    {
      commands: new Set(['SendMessageCommand', 'SendMessageBatchCommand']),
      methods: new Set(['sendMessage', 'sendMessageBatch']),
    },
  ],
  [
    '@aws-sdk/client-sns',
    {
      commands: new Set(['PublishCommand', 'PublishBatchCommand']),
      methods: new Set([PUBLISH_METHOD, 'publishBatch']),
    },
  ],
]);

function moduleName(specifier) {
  const bare = specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier;
  return BUILT_IN_CALLS.has(bare) ? bare : specifier;
}

export function packageFromPath(fileName) {
  const normalized = fileName.replaceAll('\\', '/');
  const index = normalized.lastIndexOf('/node_modules/');
  if (index === -1) {
    return undefined;
  }
  const parts = normalized.slice(index + '/node_modules/'.length).split('/');
  const name = parts[0].startsWith('@') || parts[0] === '.prisma' ? parts.slice(0, 2) : [parts[0]];
  const joined = name.join('/');
  return joined.startsWith('@types/') ? joined.slice('@types/'.length) : joined;
}

export function isDatabasePackage(name) {
  return DATABASE_PACKAGES.has(name) || DATABASE_SCOPES.some((scope) => name.startsWith(scope));
}

function isRemotePackage(name) {
  return REMOTE_PACKAGES.has(name) || REMOTE_SCOPES.some((scope) => name.startsWith(scope));
}

function brokerClientKind(client, view) {
  const command = view.args[0]?.type === 'new' ? view.args[0].name : undefined;
  const publishes = client.commands.has(command) || client.methods.has(view.method);
  return publishes ? MESSAGE : REMOTE;
}

function isBuilderPackage(name) {
  return BUILDER_PACKAGES.has(name) || name.startsWith('drizzle-orm/');
}

export function isCachePackage(name) {
  return CACHE_PACKAGES.has(name);
}

function asyncKind(kind, isAsync, name = '') {
  return isAsync(isBuilderPackage(name)) ? kind : undefined;
}

function storeOrRemoteKind(name, view, isAsync) {
  if (SYNC_DATABASE_PACKAGES.has(name)) {
    return SYNC_DATABASE_CALLS.has(view.method) ? DATABASE : asyncKind(DATABASE, isAsync);
  }
  if (isDatabasePackage(name)) {
    return asyncKind(DATABASE, isAsync, name);
  }
  return isRemotePackage(name) ? asyncKind(REMOTE, isAsync) : undefined;
}

export function libraryKind(specifier, view, isAsync) {
  const name = moduleName(specifier);
  const builtIn = BUILT_IN_CALLS.get(name);
  if (builtIn !== undefined) {
    const resolves = name.startsWith('dns') && view.method?.startsWith('resolve') === true;
    return builtIn.has(view.method) || resolves ? REMOTE : undefined;
  }
  const publishes = MESSAGE_PACKAGES.get(name);
  if (publishes !== undefined) {
    return publishes.has(view.method) ? MESSAGE : undefined;
  }
  const client = BROKER_CLIENTS.get(name);
  return client === undefined
    ? storeOrRemoteKind(name, view, isAsync)
    : asyncKind(brokerClientKind(client, view), isAsync);
}

export function messagePackages() {
  return [...MESSAGE_PACKAGES.keys(), ...BROKER_CLIENTS.keys()];
}
