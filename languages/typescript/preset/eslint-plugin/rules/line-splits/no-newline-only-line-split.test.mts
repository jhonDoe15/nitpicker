import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-newline-only-line-split.mts';

const tester = typescriptRuleTester();

function flagged(code: string) {
  return { code, errors: [{ messageId: 'newlineOnly' }] };
}

const IMPORT =
  'import { readFileSync } from "node:fs";\nimport { readFile } from "node:fs/promises";\n';

tester.run('no-newline-only-line-split', rule, {
  valid: [
    `${IMPORT}export const lines = readFileSync("a.txt", "utf8").split(/\\r?\\n/);`,
    `${IMPORT}export const lines = readFileSync("a.txt", "utf8").split(/\\r\\n|\\r|\\n/);`,
    `${IMPORT}export const lines = readFileSync("a.txt", "utf8").replace(/\\r\\n/g, "\\n").split("\\n");`,
    `${IMPORT}export const text = readFileSync("a.txt", "utf8"); export const lines = text.split(EOL);`,
    `${IMPORT}export const text = readFileSync("a.txt", "utf8").replaceAll("\\r\\n", "\\n"); export const lines = text.split("\\n");`,
    'export const lines = generated.split("\\n");',
    'export const lines = content.split("\\n");',
    'export function show(code: string) { return code.split("\\n"); }',
    `${IMPORT}export const parts = readFileSync("a.txt", "utf8").split(",");`,
    `${IMPORT}export const lines = readFileSync("a.txt", "utf8").split("\\n", 2);`,
    `${IMPORT}export const text = readFileSync("a.txt", "utf8"); export const n = text.length;`,
    'export const lines = comment.text.split("\\n");',
    'export const lines = ["a", "b"].join("\\n").split("\\n");',
    `${IMPORT}export function f(path: string) { const text = path; return text.split("\\n"); }`,
    'export const lines = cache.get("x").split("\\n");',
  ],
  invalid: [
    flagged(`${IMPORT}export const lines = readFileSync("a.txt", "utf8").split("\\n");`),
    flagged(`${IMPORT}export const lines = readFileSync("a.txt", "utf8").trim().split("\\n");`),
    flagged(`${IMPORT}export const lines = readFileSync("a.txt").toString().split("\\n");`),
    flagged(
      `${IMPORT}const text = readFileSync("a.txt", "utf8"); export const lines = text.split("\\n");`,
    ),
    flagged(
      `${IMPORT}export async function load(p: string) { const text = await readFile(p, "utf8"); return text.split('\\n'); }`,
    ),
    flagged(
      `${IMPORT}export async function load(p: string) { return (await readFile(p, "utf8")).split("\\n"); }`,
    ),
    flagged(
      `${IMPORT}export const text = readFileSync("a.txt", "utf8"); export const end = text.indexOf("\\n");`,
    ),
    flagged(
      `${IMPORT}export const text = readFileSync("a.txt", "utf8"); export const end = text.lastIndexOf("\\n");`,
    ),
    flagged(`${IMPORT}export const lines = readFileSync("a.txt", "utf8").split(/\\n/);`),
    flagged(
      'export async function load() { return (await Bun.file("a.txt").text()).split("\\n"); }',
    ),
    flagged(
      'export function check(comment: { value: string }) { return comment.value.split("\\n"); }',
    ),
    flagged(
      'export function check(node: Node) { const lastComment = node; return lastComment.value.indexOf("\\n"); }',
    ),
  ],
});
