import {
  CHILD_PROCESS_MODULES,
  CRYPTO_MODULES,
  EXECA_MODULES,
  FS_EXTRA_MODULES,
  FS_MODULES,
  ZLIB_MODULES,
} from '../analysis/node/node-sync-modules.mts';

export type SyncFamily = {
  readonly modules: ReadonlySet<string>;
  readonly matches: (name: string) => boolean;
  readonly alternative: (name: string) => string;
};

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
const FS_ALTERNATIVES = new Map<string, string>([
  ['globSync', `\`for await (const entry of glob(pattern))\` with \`glob\` from ${FS_PROMISES}`],
  [
    'existsSync',
    `\`access\` or \`stat\` from ${FS_PROMISES} (\`await access(path)\` rejects when the path is missing)`,
  ],
  ...DESCRIPTOR_CALLS.map((name): [string, string] => [name, FILE_HANDLE]),
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

function asyncName(name: string): string {
  return name.replace(ENDS_WITH_SYNC, '');
}

function promisified(name: string): string {
  return `\`await promisify(${asyncName(name)})(...)\` with \`promisify\` from "node:util"`;
}

const SUBPROCESS_CAVEAT =
  'The result becomes `{ stdout, stderr }` strings instead of a Buffer and a failure rejects with a different error shape, so check what the code does with both';

function subprocessAlternative(name: string): string {
  const imports = 'from "node:child_process" and `promisify` from "node:util"';
  if (name === 'execSync') {
    return `\`await promisify(exec)(command)\` with \`exec\` ${imports}, which keeps the shell that \`execSync\` runs the command in (\`execFile\` runs none, so \`&&\`, pipes and globs would fail). ${SUBPROCESS_CAVEAT}`;
  }
  return `\`await promisify(execFile)(file, args)\` with \`execFile\` ${imports}, which runs the file without a shell. ${SUBPROCESS_CAVEAT}`;
}

export const SYNC_FAMILIES: readonly SyncFamily[] = [
  {
    modules: new Set(FS_MODULES),
    matches: (name: string) => ENDS_WITH_SYNC.test(name),
    alternative: (name: string) =>
      FS_ALTERNATIVES.get(name) ?? `\`await ${asyncName(name)}()\` from ${FS_PROMISES}`,
  },
  {
    modules: new Set(FS_EXTRA_MODULES),
    matches: (name: string) => ENDS_WITH_SYNC.test(name),
    alternative: (name: string) =>
      `\`await ${name === 'existsSync' ? 'pathExists' : asyncName(name)}()\` from "fs-extra"`,
  },
  {
    modules: new Set(CHILD_PROCESS_MODULES),
    matches: (name: string) => SUBPROCESS_SYNC_CALLS.includes(name),
    alternative: subprocessAlternative,
  },
  {
    modules: new Set(CRYPTO_MODULES),
    matches: (name: string) => CRYPTO_SYNC_CALLS.includes(name),
    alternative: promisified,
  },
  {
    modules: new Set(ZLIB_MODULES),
    matches: (name: string) => ENDS_WITH_SYNC.test(name),
    alternative: (name: string) => `${promisified(name)}, or the stream \`pipeline\` API`,
  },
  {
    modules: new Set(EXECA_MODULES),
    matches: (name: string) => EXECA_SYNC_CALLS.includes(name),
    alternative: (name: string) => `\`await ${asyncName(name)}()\``,
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
