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
    'domain Reflect.set names spread',
    'export const f = (o) => Reflect.set(o, "a", 1);',
    'spread',
  ),
];
