import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-constant-lookup-in-loop.mts';

const tester = typescriptRuleTester();

const DOM = (call: string) => ({ messageId: 'domLookup', data: { call } });
const URL_PARSE = (argument: string) => ({ messageId: 'urlParse', data: { argument } });

tester.run('no-constant-lookup-in-loop', rule, {
  valid: [
    'export function f(els: HTMLElement[]) { for (const el of els) { el.classList.add("sel"); console.log(document.querySelectorAll(".sel").length); } }',
    'export function f(els: HTMLElement[]) { els.forEach((el) => { el.className = "sel"; console.log(document.querySelectorAll(".sel")); }); }',
    'export function f(els: HTMLElement[]) { for (const el of els) { el.id = "x"; console.log(document.getElementById("x")); } }',
    'export function f(els: HTMLElement[]) { for (const el of els) { el.focus(); console.log(document.querySelector(":focus")); } }',
    'export function f(els: HTMLElement[]) { for (const el of els) { const node = el; node.hidden = true; console.log(document.querySelector(".x")); } }',
    'export function f() { return document.getElementById("total"); }',
    'export function f(rows: string[]) { const total = document.getElementById("total"); for (const row of rows) { console.log(total, row); } }',
    'export function f(rows: string[]) { for (const row of rows) { console.log(document.getElementById(row)); } }',
    'export function f(rows: string[]) { for (const row of rows) { document.getElementById("total")?.append(row); } }',
    'export function f(rows: string[]) { for (const row of rows) { const total = document.querySelector("#total"); if (total) total.textContent = row; } }',
    'export function f(rows: string[]) { for (const row of rows) { render(row); console.log(document.querySelector("#total")); } }\ndeclare function render(row: string): void;',
    'export function f(rows: string[]) { for (const row of rows) { app.render(row); console.log(document.querySelector("#total")); } }\ndeclare const app: { render(row: string): void };',
    'export async function f(rows: string[]) { for (const row of rows) { await tick(row); console.log(document.querySelector("#total")); } }\ndeclare function tick(row: string): Promise<void>;',
    'export function f(rows: HTMLElement[]) { for (const row of rows) { row.remove(); console.log(document.querySelector("#total")); } }',
    'export function f(rows: string[], document: Document) { for (const row of rows) { console.log(document.querySelector("#total"), row); } }',
    'export function f(rows: string[]) { for (const row of rows) { const url = new URL("https://example.com/api"); url.searchParams.set("id", row); send(url); } }\ndeclare function send(url: URL): void;',
    'export function f(rows: string[]) { for (const row of rows) { send(new URL("https://example.com/api")); } }\ndeclare function send(url: URL): void;',
    'export function f(rows: string[]) { for (const row of rows) { console.log(new URL(row).host); } }',
    'export function f(rows: string[]) { for (const row of rows) { console.log(new URL("/a", row).host); } }',
    'export function f() { return new URL("https://example.com").host; }',
    'export function f(rows: string[]) { for (const row of rows) { const url = new URL("https://example.com"); url.hash = row; console.log(url.href); } }',
  ],
  invalid: [
    {
      code: 'export function f(rows: string[]) { for (const row of rows) { console.log(document.getElementById("total"), row); } }',
      errors: [DOM('document.getElementById("total")')],
    },
    {
      code: 'const SELECTOR = "[data-total]";\nexport function f(rows: string[]) { return rows.map((row) => row + ":" + String(window.document.querySelector(SELECTOR)?.id)); }',
      errors: [DOM('window.document.querySelector(SELECTOR)')],
    },
    {
      code: 'export function f(rows: { id: string }[]) { const seen: string[] = []; for (const row of rows) { seen.push(row.id); const cells = document.querySelectorAll(".cell"); console.log(cells.length); } return seen; }',
      errors: [DOM('document.querySelectorAll(".cell")')],
    },
    {
      code: 'const BASE = "https://example.com/api";\nexport function f(paths: string[]) { return paths.map((path) => new URL(BASE).origin + "/" + path); }',
      errors: [URL_PARSE('BASE')],
    },
    {
      code: 'export function f(paths: string[]) { for (const path of paths) { const base = new URL("https://example.com/api"); console.log(base.origin, base.toString(), path); } }',
      errors: [URL_PARSE('"https://example.com/api"')],
    },
  ],
});
