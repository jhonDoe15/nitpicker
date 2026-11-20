import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-unguarded-json-parse.mts';

const tester = typescriptRuleTester();

function flagged(code: string) {
  return { code, errors: [{ messageId: 'unguarded' }] };
}

tester.run('no-unguarded-json-parse', rule, {
  valid: [
    {
      code: 'export function load() { return JSON.parse(localStorage.getItem("k") ?? "{}"); }',
      filename: 'packages/create-app/templates/auth/src/provider.ts',
    },
    {
      code: 'export function load() { return JSON.parse(localStorage.getItem("k") ?? "{}"); }',
      filename: 'docs/js/prism.min.js',
    },
    'export function load(migrationsJsonPath: string) { return JSON.parse(readFileSync(migrationsJsonPath, "utf8")); }',
    'export function load(text: string) { return JSON.parse(text); }',
    'export function load(raw: string) { return JSON.parse(raw); }',
    'export const config = JSON.parse(\'{"a":1}\');',
    'export function load(data: unknown) { return JSON.parse(JSON.stringify(data)); }',
    'export function load(file: string) { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return ' +
      'undefined; } }',
    'export async function load(file: string) { try { const text = await fs.readFile(file, "utf8"); return ' +
      'JSON.parse(text); } catch (error) { log(error); return {}; } }',
    'export function load() { try { return JSON.parse(localStorage.getItem("k") ?? "{}"); } catch { return {}; } }',
    'export function load(file: string) { return fs.promises.readFile(file, "utf8").then((text) => ' +
      'JSON.parse(text)).catch(() => undefined); }',
    'export function load(file: string) { try { return [1].map(() => JSON.parse(readFileSync(file, "utf8"))); } ' +
      'catch { return []; } }',
    'export function load(key: string) { return JSON.parse(cache.getItem(key)); }',
    'export function load(key: string) { return JSON.parse(store.localStorageValue(key)); }',
    'export function load(res: Response) { return JSON.parse(parsed.text()); }',
    'socket.on("close", (data) => { JSON.parse(data); });',
    'socket.on("message", (data, other) => { JSON.parse(other); });',
    'const handler = (data) => JSON.parse(data);',
    'export function load(file: string) { const text = readFileSync(file, "utf8"); return text; }',
    'export function load(file: string) { try { run(); } catch { return JSON.parse("{}"); } }',
    'export function load() { return JSON.parse(readFileSync("package.json", "utf8")); }',
    'export function load(packageJsonPath: string) { return JSON.parse(readFileSync(packageJsonPath, "utf8")); }',
    'export function load() { return JSON.parse(readFileSync(new URL("./data.json", import.meta.url), "utf8")); }',
    'export function load() { return JSON.parse(readFileSync(0, "utf8")); }',
    {
      code: 'export function load(file: string) { return JSON.parse(readFileSync(file, "utf8")); }',
      filename: 'scripts/build.ts',
    },
    {
      code: 'export function load(file: string) { return JSON.parse(readFileSync(file, "utf8")); }',
      filename: 'rollup.config.mjs',
    },
  ],
  invalid: [
    flagged(
      'export function load(file: string) { return JSON.parse(readFileSync(file, "utf8")); }',
    ),
    flagged(
      'export async function load(file: string) { return JSON.parse(await fs.readFile(file, "utf8")); }',
    ),
    flagged(
      'export async function load(file: string) { const text = await fs.promises.readFile(file, "utf8"); return ' +
        'JSON.parse(text); }',
    ),
    flagged(
      'export function load(file: string) { return JSON.parse(readFileSync(file).toString()); }',
    ),
    flagged('export function load() { return JSON.parse(localStorage.getItem("k")!); }'),
    flagged(
      'export function load() { return JSON.parse(window.localStorage.getItem("k") || "{}"); }',
    ),
    flagged(
      'export function load() { const saved = sessionStorage.getItem("k"); return JSON.parse(saved ?? "[]"); }',
    ),
    flagged(
      'export async function load(response: Response) { return JSON.parse(await response.text()); }',
    ),
    flagged('socket.on("message", (data) => { handle(JSON.parse(data.toString())); });'),
    flagged('window.addEventListener("message", (event) => { handle(JSON.parse(event.data)); });'),
    flagged(
      'export function load(file: string) { try { run(); } finally { cleanup(); } return ' +
        'JSON.parse(readFileSync(file, "utf8")); }',
    ),
    flagged(
      'export function load(file: string) { const read = () => { try { return 1; } catch { return 2; } }; return ' +
        'JSON.parse(readFileSync(file, "utf8")); }',
    ),
    flagged(
      'export function load(file: string) { try { run(); } catch { return JSON.parse(readFileSync(file, "utf8")); } }',
    ),
    flagged(
      'export function load(file: string) { try { run(); } finally { return JSON.parse(readFileSync(file, "utf8")); ' +
        '} }',
    ),
  ],
});
