import {
  CHILD_PROCESS_MODULES,
  CRYPTO_MODULES,
  EXECA_MODULES,
  FS_EXTRA_MODULES,
  FS_MODULES,
  ZLIB_MODULES,
} from '../analysis/node-sync-modules.mjs';

const ENDS_WITH_SYNC = /Sync$/u;
const FS_PROMISES = '"node:fs/promises"';
const FILE_HANDLE = `a \`FileHandle\` from \`open()\` of ${FS_PROMISES} (\`await handle.read()\`, \`await handle.close()\`)`;
const DESCRIPTOR_CALLS = [
  'closeSync',
  'readSync',
  'writeSync',
  'readvSync',
  'writevSync',
  'fstatSync',
  'fsyncSync',
  'fdatasyncSync',
  'ftruncateSync',
  'futimesSync',
  'fchmodSync',
  'fchownSync',
];
const FS_ALTERNATIVES = new Map([
  ['globSync', `\`for await (const entry of glob(pattern))\` with \`glob\` from ${FS_PROMISES}`],
  [
    'existsSync',
    `\`access\` or \`stat\` from ${FS_PROMISES} (\`await access(path)\` rejects when the path is missing)`,
  ],
  ...DESCRIPTOR_CALLS.map((name) => [name, FILE_HANDLE]),
]);
const CRYPTO_SYNC_CALLS = [
  'pbkdf2Sync',
  'scryptSync',
  'hkdfSync',
  'generateKeySync',
  'generateKeyPairSync',
  'generatePrimeSync',
  'checkPrimeSync',
];
const SUBPROCESS_SYNC_CALLS = ['execSync', 'execFileSync', 'spawnSync'];
const EXECA_SYNC_CALLS = ['execaSync', 'execaCommandSync'];

function asyncName(name) {
  return name.replace(ENDS_WITH_SYNC, '');
}

function promisified(name) {
  return `\`await promisify(${asyncName(name)})(...)\` with \`promisify\` from "node:util"`;
}

export const SYNC_FAMILIES = [
  {
    modules: new Set(FS_MODULES),
    matches: (name) => ENDS_WITH_SYNC.test(name),
    alternative: (name) =>
      FS_ALTERNATIVES.get(name) ?? `\`await ${asyncName(name)}()\` from ${FS_PROMISES}`,
  },
  {
    modules: new Set(FS_EXTRA_MODULES),
    matches: (name) => ENDS_WITH_SYNC.test(name),
    alternative: (name) =>
      `\`await ${name === 'existsSync' ? 'pathExists' : asyncName(name)}()\` from "fs-extra"`,
  },
  {
    modules: new Set(CHILD_PROCESS_MODULES),
    matches: (name) => SUBPROCESS_SYNC_CALLS.includes(name),
    alternative: () =>
      '`await promisify(execFile)(file, args)` with `execFile` from "node:child_process" and `promisify` from "node:util"',
  },
  {
    modules: new Set(CRYPTO_MODULES),
    matches: (name) => CRYPTO_SYNC_CALLS.includes(name),
    alternative: promisified,
  },
  {
    modules: new Set(ZLIB_MODULES),
    matches: (name) => ENDS_WITH_SYNC.test(name),
    alternative: (name) => `${promisified(name)}, or the stream \`pipeline\` API`,
  },
  {
    modules: new Set(EXECA_MODULES),
    matches: (name) => EXECA_SYNC_CALLS.includes(name),
    alternative: (name) => `\`await ${asyncName(name)}()\``,
  },
];

export const WORKER_MODULES = ['worker_threads', 'node:worker_threads'];

export const FRAMEWORK_MODULES = [
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
];

export const ROUTE_METHODS = [
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
];

export const NEST_DECORATORS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Head', 'Options'];

export const SYNCHRONOUS_CALLBACK_METHODS = [
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
];
