import { productionPolicyConfigFor } from '../../eslint-config/policy/production-policy.mjs';
import { strictSyntaxConfigFor } from '../../eslint-config/strict.mjs';
import { defaultResolvedLayout } from '../../layout.mjs';

const config = [
  ...productionPolicyConfigFor(defaultResolvedLayout),
  ...strictSyntaxConfigFor(defaultResolvedLayout),
];

const adapter = 'src/main/features/billing/adapters/store.ts';
const domain = 'src/main/features/billing/domain/invoice.ts';

function policyCase(name, filename, banned, allowed) {
  return { name: `policy: ${name}`, config, filename, banned, allowed };
}

export const policyFailureMessageCases = [
  policyCase(
    'export * names the listed export',
    'src/main/features/billing/index.ts',
    "export * from './domain/invoice.js';",
    'export { name }',
  ),
  policyCase(
    'discarded allSettled names Promise.all',
    adapter,
    'export async function run(jobs) { await Promise.allSettled(jobs); }',
    'Promise.all',
  ),
  policyCase(
    'Promise wrapper names Promise.resolve',
    adapter,
    'export function id(x) { return new Promise((resolve) => resolve(x)); }',
    'Promise.resolve',
  ),
  policyCase(
    'process.env names the composition root',
    adapter,
    "export const url = process.env['API_URL'];",
    'composition root',
  ),
  policyCase(
    'process.env names the exception route',
    adapter,
    "export const url = process.env['API_URL'];",
    'exception for this rule in nitpicker.config.json',
  ),
  policyCase(
    'process.exit names the main guard',
    adapter,
    'export function stop() { process.exit(1); }',
    'main guard',
  ),
  policyCase(
    'shell string names execFile',
    adapter,
    "import { exec } from 'node:child_process'; export function ls(dir) { exec(`ls ${dir}`); }",
    'execFile',
  ),
  policyCase(
    'path join names the containment check',
    adapter,
    "import { readFileSync } from 'node:fs'; import path from 'node:path'; export function read(name) { return readFileSync(path.join('/srv', name)); }",
    'startsWith',
  ),
  policyCase(
    'Math.random names crypto.randomUUID',
    adapter,
    'export const token = Math.random().toString(36);',
    'crypto.randomUUID()',
  ),
  policyCase(
    'unknown main folder names features',
    'src/main/utils/strings.ts',
    'export const a = 1;',
    'features/<name>/',
  ),
  policyCase(
    'mutable module state names the composition root',
    adapter,
    'const cache = new Map(); export function put(k, v) { cache.set(k, v); }',
    'composition root',
  ),
  policyCase(
    'domain process names adapters',
    domain,
    "export const url = process['argv'];",
    'adapters/',
  ),
  policyCase(
    'domain setTimeout names adapters',
    domain,
    'export function later(f) { setTimeout(f, 1); }',
    'adapters/',
  ),
  policyCase(
    'domain Date.now alias names a parameter',
    domain,
    'export const read = Date.now;',
    'as a parameter',
  ),
  policyCase(
    'domain performance.now names a parameter',
    domain,
    'export const t = performance.now();',
    'as a parameter',
  ),
  policyCase(
    'domain Reflect.set names spread',
    domain,
    'export const f = (o) => Reflect.set(o, "a", 1);',
    'spread',
  ),
];
