const ENDS_WITH_SYNC = /Sync$/u;

const PROMISIFIED = 'the callback form wrapped with `util.promisify`';

export const SYNC_FAMILIES = [
  {
    modules: new Set(['fs', 'node:fs', 'fs-extra', 'graceful-fs']),
    matches: (name) => ENDS_WITH_SYNC.test(name),
    alternative:
      'the promise API (`import { readFile } from "node:fs/promises"`, `await readFile(path)`)',
  },
  {
    modules: new Set(['child_process', 'node:child_process']),
    matches: (name) => ['execSync', 'execFileSync', 'spawnSync'].includes(name),
    alternative: '`execFile` or `spawn` wrapped with `util.promisify`, or `execa`',
  },
  {
    modules: new Set(['crypto', 'node:crypto']),
    matches: (name) =>
      [
        'pbkdf2Sync',
        'scryptSync',
        'generateKeyPairSync',
        'generatePrimeSync',
        'checkPrimeSync',
      ].includes(name),
    alternative: PROMISIFIED,
  },
  {
    modules: new Set(['zlib', 'node:zlib']),
    matches: (name) => ENDS_WITH_SYNC.test(name),
    alternative: `${PROMISIFIED} (\`promisify(gzip)\`) or the stream \`pipeline\` API`,
  },
  {
    modules: new Set(['execa']),
    matches: (name) => ['execaSync', 'execaCommandSync'].includes(name),
    alternative: 'the async `execa()` or `execaCommand()`',
  },
];

export const SYNC_MODULES = new Set(SYNC_FAMILIES.flatMap((family) => [...family.modules]));

export const WORKER_MODULES = new Set(['worker_threads', 'node:worker_threads']);

export const FRAMEWORK_MODULES = new Set([
  'express',
  'fastify',
  'koa',
  '@koa/router',
  'koa-router',
  'hono',
  '@hapi/hapi',
  'restify',
  'connect',
  'polka',
  'h3',
  'itty-router',
]);

export const ROUTE_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'all',
  'head',
  'options',
  'use',
  'route',
]);

export const NEST_DECORATORS = new Set([
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'All',
  'Head',
  'Options',
]);

export const SYNCHRONOUS_CALLBACK_METHODS = new Set([
  'map',
  'forEach',
  'filter',
  'reduce',
  'reduceRight',
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flatMap',
  'sort',
  'toSorted',
]);
