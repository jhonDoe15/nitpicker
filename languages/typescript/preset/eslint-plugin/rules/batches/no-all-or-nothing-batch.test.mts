import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-all-or-nothing-batch.mts';

const tester = typescriptRuleTester();

function flagged(code: string) {
  return { code, errors: [{ messageId: 'allOrNothing' }] };
}

tester.run('no-all-or-nothing-batch', rule, {
  valid: [
    'export async function load(files: string[]) { return Promise.all(files.map(async (file) => { try { return JSON.parse(await readFile(file, "utf8")); } catch { return undefined; } })); }',
    'export async function load(files: string[]) { return Promise.all(files.map(async (file) => readFile(file, "utf8").catch(() => ""))); }',
    'export async function load(files: string[]) { return Promise.allSettled(files.map(async (file) => readFile(file, "utf8"))); }',
    'export async function load(files: string[]) { await Promise.all(files.map(async (file) => readFile(file, "utf8"))); }',
    'export async function load(items: string[]) { return Promise.all(items.map(async (item) => readFile(item, "utf8"))); }',
    'export async function load(files: string[]) { return Promise.all(files.map(async (file) => stat(file))); }',
    'export async function load(files: string[]) { return Promise.all(files.map(async (file) => path.parse(file))); }',
    'export async function load(files: string[]) { try { return await Promise.all(files.map(async (file) => readFile(file, "utf8"))); } catch { return []; } }',
    'export async function load(files: string[]) { return Promise.all(files.map(readFile)); }',
    'export async function load(files: string[]) { const rows = files.map((file) => JSON.parse(file)); return rows; }',
    'export async function load(files: string[]) { return Promise.all(files.map(async (file) => { const parse = () => JSON.parse(file); return parse; })); }',
    'async function one(file: string) { try { return JSON.parse(await readFile(file, "utf8")); } catch { return undefined; } } export async function load(files: string[]) { return Promise.all(files.map(one)); }',
  ],
  invalid: [
    flagged(
      'export async function load(files: string[]) { return Promise.all(files.map(async (file) => JSON.parse(await readFile(file, "utf8")))); }',
    ),
    flagged(
      'export async function load(paths: string[]) { const rows = await Promise.all(paths.map(async (item) => readFile(item, "utf8"))); return rows; }',
    ),
    flagged(
      'export async function load(dir: string) { const names = await readdir(dir); return Promise.all(names.map(async (name) => parse(await readFile(name, "utf8")))); }',
    ),
    flagged(
      'export async function load(dir: string) { return Promise.all((await readdir(dir)).map(async (name) => readFile(name, "utf8"))); }',
    ),
    flagged(
      'async function one(file: string) { return JSON.parse(await readFile(file, "utf8")); } export async function load(options: Options) { return Promise.all(options.files.map(one)); }',
    ),
    flagged(
      'export async function load(files: string[]) { return Promise.all(files.map(async function (file) { try { log(); } catch {} return parser.parse(file); })); }',
    ),
    flagged(
      'export async function load(modules: string[]) { return Promise.all(modules.map((module) => fs.promises.readFile(module, "utf8").then((text) => text))); }',
    ),
  ],
});
