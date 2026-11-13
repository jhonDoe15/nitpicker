import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-undefined-only-env-check.mjs';

const tester = typescriptRuleTester();

function flagged(
  code,
  messageId = 'undefinedOnly',
  filename = 'src/features/api/adapters/config.ts',
) {
  return { code, filename, errors: [{ messageId }] };
}

function allowed(code, filename = 'src/features/api/adapters/config.ts') {
  return { code, filename };
}

tester.run('no-undefined-only-env-check', rule, {
  valid: [
    allowed('export const enabled = Boolean(process.env.API_URL);'),
    allowed('export function url() { if (!process.env.API_URL) { throw new Error("API_URL"); } }'),
    allowed('export const api = process.env.API_URL || "http://localhost";'),
    allowed('export const api = process.env.API_URL ?? "";'),
    allowed('export const api = process.env.API_URL ?? undefined;'),
    allowed('export const set = process.env.API_URL !== undefined && process.env.API_URL !== "";'),
    allowed(
      'export const set = process.env.API_URL !== undefined && process.env.API_URL.length > 0;',
    ),
    allowed(
      'export const unset = process.env.API_URL === undefined || process.env.API_URL.trim() === "";',
    ),
    allowed('const url = process.env.API_URL; export const set = url !== undefined && url !== "";'),
    allowed('export function on(flag: string | undefined) { return flag !== undefined; }'),
    allowed('export function read(name: string) { return process.env[name] !== undefined; }'),
    allowed(
      'export const map = new Map<string, string>(); export const has = map.get("x") !== undefined;',
    ),
    allowed('let url = process.env.API_URL; url = "x"; export const set = url !== undefined;'),
    allowed('export const port = process.env.PORT ?? "3000";', 'src/main.ts'),
    allowed('export const mode = import.meta.env.MODE === "production";'),
    allowed('export function f(process: NodeJS.Process) { return process.env.A !== undefined; }'),
    allowed(
      'export const ok = process.env.API_URL !== undefined && process.env.API_URL.startsWith("https");',
    ),
    allowed('const { API_URL = "" } = process.env; export const api = API_URL;'),
    allowed('const { PORT = "3000" } = process.env; export const port = PORT;', 'src/main.ts'),
  ],
  invalid: [
    flagged('export const set = process.env.API_URL !== undefined;'),
    flagged('export const set = process.env.API_URL != null;'),
    flagged('export const unset = undefined === process.env["API_URL"];'),
    flagged(
      'export function url() { if (process.env.API_URL === undefined) { throw new Error("x"); } }',
    ),
    flagged('export const unset = typeof process.env.API_URL === "undefined";'),
    flagged('export const set = "API_URL" in process.env;'),
    flagged('export const set = Object.hasOwn(process.env, "API_URL");'),
    flagged('export const set = process.env.hasOwnProperty("API_URL");'),
    flagged('const url = process.env.API_URL; export const set = url !== undefined;'),
    flagged('const { API_URL } = process.env; export const set = API_URL !== undefined;'),
    flagged('export const set = globalThis.process.env.API_URL !== undefined;'),
    flagged('export const set = import.meta.env.VITE_API !== undefined;'),
    flagged('export const set = Bun.env.API_URL !== undefined;'),
    flagged('export const set = Deno.env.get("API_URL") !== undefined;'),
    flagged('export const set = process.env.API_URL !== undefined && process.env.TOKEN !== "";'),
    flagged('export const port = process.env.PORT ?? "3000";', 'nullishFallback'),
    flagged(
      'const port = process.env.PORT; export const value = port ?? "3000";',
      'nullishFallback',
    ),
    flagged('export const api = process.env.NEXT_PUBLIC_API ?? "/api";', 'nullishFallback'),
    flagged('const env = process.env; export const set = env.API_URL !== undefined;'),
    flagged('const env = process.env; export const set = "API_URL" in env;'),
    flagged('export function f() { process.env.PORT ??= "3000"; }', 'nullishFallback'),
    flagged('const { PORT = "3000" } = process.env; export const port = PORT;', 'nullishFallback'),
  ],
});
