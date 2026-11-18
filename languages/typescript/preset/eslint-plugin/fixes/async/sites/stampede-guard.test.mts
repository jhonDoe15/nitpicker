import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../../../rules/async/no-sync-node-api-in-async.mts';
import { declines, fixes, FS } from '../sync-fs-test-support.mts';

typescriptRuleTester().run('shared state around a sync call', rule, {
  valid: [],
  invalid: [
    declines(
      `${FS}const cache = makeCache();\nexport async function get(k: string) { if (!cache.has(k)) { cache.set(k, fs.readFileSync('a.txt', 'utf8')); } return cache.get(k); }`,
    ),
    declines(
      `${FS}import { cache } from './cache.mts';\nexport async function get(k: string) { return cache.get(k) ?? fs.readFileSync('a.txt', 'utf8'); }`,
    ),
    declines(
      `${FS}export function outer(cache: Map<string, string>) { return async (k: string) => { if (!cache.has(k)) { cache.set(k, fs.readFileSync('a.txt', 'utf8')); } }; }`,
    ),
    declines(
      `${FS}let cache = makeCache();\nexport async function get(k: string) { cache.set(k, fs.readFileSync('a.txt', 'utf8')); }`,
    ),
    declines(
      `${FS}const seen = makeSet();\nexport async function get(k: string) { seen.add(fs.readFileSync('a.txt', 'utf8')); }`,
    ),
    declines(
      `${FS}let total = 0;\nexport async function add() { const t = total; const n = fs.readFileSync('a.txt').length; total = t + n; }`,
    ),
    declines(
      `${FS}export function outer() { let total = 0; return async () => { const t = total; const n = fs.readFileSync('a.txt').length; total = t + n; }; }`,
    ),
    fixes(
      `${FS}export async function get(k: string) { const seen = new Map<string, string>(); if (!seen.has(k)) { seen.set(k, fs.readFileSync('a.txt', 'utf8')); } return seen; }`,
      `${FS}export async function get(k: string) { const seen = new Map<string, string>(); if (!seen.has(k)) { seen.set(k, await fs.promises.readFile('a.txt', 'utf8')); } return seen; }`,
    ),
    fixes(
      `${FS}let total = 0;\nexport async function add() { const n = fs.readFileSync('a.txt').length; return total + n; }`,
      `${FS}let total = 0;\nexport async function add() { const n = (await fs.promises.readFile('a.txt')).length; return total + n; }`,
    ),
    fixes(
      `${FS}let total = 0;\nexport async function add() { total = 1; const n = fs.readFileSync('a.txt').length; return total + n; }`,
      `${FS}let total = 0;\nexport async function add() { total = 1; const n = (await fs.promises.readFile('a.txt')).length; return total + n; }`,
    ),
  ],
});
