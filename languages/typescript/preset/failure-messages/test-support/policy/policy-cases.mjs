import {
  productionLayoutConfigFor,
  productionPolicyConfigFor,
} from '../../../eslint-config/policy/production-policy.mjs';
import { strictSyntaxConfigFor } from '../../../eslint-config/strict.mjs';
import { defaultResolvedLayout } from '../../../layout.mjs';

const config = [
  ...productionPolicyConfigFor(defaultResolvedLayout),
  ...productionLayoutConfigFor(defaultResolvedLayout),
  ...strictSyntaxConfigFor(defaultResolvedLayout),
];

function casesIn(filename) {
  return function policyCase(name, banned, allowed) {
    return { name: `policy: ${name}`, config, filename, banned, allowed };
  };
}

const adapterCase = casesIn('src/main/features/billing/adapters/store.ts');
const domainCase = casesIn('src/main/features/billing/domain/invoice.ts');
const indexCase = casesIn('src/main/features/billing/index.ts');
const utilsCase = casesIn('src/main/utils/strings.ts');

export const policyFailureMessageCases = [
  adapterCase(
    'magic number names a computed module constant',
    'export function old(seconds: number) { return seconds > 86400; }',
    'const SECONDS_PER_DAY = 24 * 60 * 60;',
  ),
  indexCase(
    'export * names the listed export',
    "export * from './domain/invoice.js';",
    'export { name }',
  ),
  adapterCase(
    'discarded allSettled names Promise.all',
    'export async function run(jobs) { await Promise.allSettled(jobs); }',
    'Promise.all',
  ),
  adapterCase(
    'unbounded fan-out names the limiter',
    'export async function load(urls: string[]) { await Promise.all(urls.map((url) => fetch(url))); }',
    'pLimit(8)',
  ),
  adapterCase(
    'unbounded fan-out names the chunked form',
    'export async function load(urls: string[]) { await Promise.all(urls.map((url) => fetch(url))); }',
    'fixed-size chunks',
  ),
  adapterCase(
    'query in a loop names the batched call',
    'export async function load(ids: string[]) { for (const id of ids) { await repository.findById(id); } }',
    'findByIds',
  ),
  adapterCase(
    'request in a loop names bounded concurrency',
    'export async function load(ids: string[]) { for (const id of ids) { await httpClient.get(id); } }',
    'p-limit',
  ),
  adapterCase(
    'query in Promise.all names one query',
    'export async function load(ids: string[]) { await Promise.all(ids.map((id) => repository.findById(id))); }',
    'in one query',
  ),
  adapterCase(
    'Redis command in a loop names mget and a pipeline',
    'export async function load(ids: string[]) { for (const id of ids) { await redisClient.get(id); } }',
    'pipeline()',
  ),
  adapterCase(
    'accumulator concat names pushing into the accumulator',
    'export const all = (xs: number[][]) => xs.reduce((acc, x) => acc.concat(x), []);',
    'push into an array',
  ),
  adapterCase(
    'remote call in a transaction names the outbox',
    'export async function run(prisma, url) { await prisma.$transaction(async (tx) => { await tx.order.create({}); await fetch(url); }); }',
    'outbox row',
  ),
  adapterCase(
    'remote call under a lock names releasing it first',
    'export async function run(mutex, url) { await mutex.runExclusive(async () => { await fetch(url); }); }',
    'after releasing it',
  ),
  adapterCase(
    'retried insert names the upsert',
    "import pRetry from 'p-retry';\nexport async function run(db) { await pRetry(() => db.query('INSERT INTO t (id) VALUES (1)')); }",
    'ON CONFLICT',
  ),
  adapterCase(
    'dual write names the outbox',
    "import { send } from 'kafkajs';\nexport async function run(o) { await orderRepository.save(o); await send(o); }",
    'outbox table',
  ),
  adapterCase(
    'dual write names the relay',
    "import { send } from 'kafkajs';\nexport async function run(o) { await orderRepository.save(o); await send(o); }",
    'relay',
  ),
  adapterCase(
    'Promise wrapper names Promise.resolve',
    'export function id(x) { return new Promise((resolve) => resolve(x)); }',
    'Promise.resolve',
  ),
  adapterCase(
    'process.env names the composition root',
    "export const url = process.env['API_URL'];",
    'composition root',
  ),
  adapterCase(
    'process.env names the exception route',
    "export const url = process.env['API_URL'];",
    'An exception fits only when',
  ),
  adapterCase(
    'process.exit names the main guard',
    'export function stop() { process.exit(1); }',
    'main guard',
  ),
  adapterCase(
    'shell string names execFile',
    "import { exec } from 'node:child_process'; export function ls(dir) { exec(`ls ${dir}`); }",
    'execFile',
  ),
  adapterCase(
    'synchronous fs call in an async function names the promise API',
    "import { readFileSync } from 'node:fs'; export async function load(path) { return readFileSync(path, 'utf8'); }",
    'node:fs/promises',
  ),
  adapterCase(
    'path join names the containment check',
    "import { readFileSync } from 'node:fs'; import path from 'node:path'; export function read(name) { return readFileSync(path.join('/srv', name)); }",
    'startsWith',
  ),
  adapterCase(
    'Math.random names crypto.randomUUID',
    'export const token = Math.random().toString(36);',
    'crypto.randomUUID()',
  ),
  adapterCase(
    'SQL built from a value names bind parameters',
    'export function find(pool, id) { return pool.query(`SELECT * FROM users WHERE id = ${id}`); }',
    'bind parameters',
  ),
  adapterCase(
    'MD5 names sha256',
    "import { createHash } from 'node:crypto'; export const id = (s) => createHash('md5').update(s).digest('hex');",
    'sha256',
  ),
  adapterCase(
    'disabled TLS verification names the CA',
    'export const options = { rejectUnauthorized: false };',
    'certificate authority',
  ),
  adapterCase(
    'fetch without a timeout names AbortSignal.timeout',
    'export function get(url) { return fetch(url); }',
    'AbortSignal.timeout',
  ),
  adapterCase(
    'timeout race names the abort controller',
    'const rejectAfter = (ms) => new Promise((_, reject) => setTimeout(reject, ms));\nexport const run = () => Promise.race([sendPayment(), rejectAfter(10)]);',
    'AbortController',
  ),
  adapterCase(
    'timeout race names the signal option',
    'const rejectAfter = (ms) => new Promise((_, reject) => setTimeout(reject, ms));\nexport const run = () => Promise.race([sendPayment(), rejectAfter(10)]);',
    '{ signal: controller.signal }',
  ),
  adapterCase(
    'unsafe deserialization names JSON.parse',
    "import { unserialize } from 'node-serialize'; export const read = (text) => unserialize(text);",
    'JSON.parse',
  ),
  utilsCase('unknown main folder names features', 'export const a = 1;\n', 'features/<name>/'),
  adapterCase(
    'mutable module state names the composition root',
    'const cache = new Map(); export function put(k, v) { cache.set(k, v); }',
    'composition root',
  ),
  domainCase('domain process names adapters', "export const url = process['argv'];", 'adapters/'),
  domainCase(
    'domain setTimeout names adapters',
    'export function later(f) { setTimeout(f, 1); }',
    'adapters/',
  ),
  domainCase(
    'domain Date.now alias names a parameter',
    'export const read = Date.now;',
    'as a parameter',
  ),
  domainCase(
    'domain performance.now names a parameter',
    'export const t = performance.now();',
    'as a parameter',
  ),
  domainCase(
    'reduce spreading its accumulator names the as const entries form',
    'export const byId = (xs) => xs.reduce((index, x) => ({ ...index, [x.id]: x }), {});',
    'new Map(xs.map((x) => [x.key, x] as const))',
  ),
  adapterCase(
    'loop spreading its accumulator names push onto a const array',
    'export function all(xs) { let out = []; for (const x of xs) { out = [...out, x]; } return out; }',
    'declare the array const before the loop and push onto it',
  ),
  domainCase(
    'domain Reflect.set names spread',
    'export const f = (o) => Reflect.set(o, "a", 1);',
    'spread',
  ),
];
