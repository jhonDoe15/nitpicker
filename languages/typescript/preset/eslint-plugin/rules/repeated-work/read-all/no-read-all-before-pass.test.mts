import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-read-all-before-pass.mts';

const tester = typescriptRuleTester();

const READ_ALL = (name: string) => ({ messageId: 'readAll', data: { name } });
const FS = 'import { readFile } from "node:fs/promises";\nimport fs from "node:fs";\n';
const DECLARE = '\ndeclare function summarize(text: string): void;';

tester.run('no-read-all-before-pass', rule, {
  valid: [
    `${FS}export async function f(paths: string[]) { const documents = await Promise.all(paths.map((path) => readFile(path, "utf8"))); for (const document of documents) { await fs.promises.writeFile("out", document); } }`,
    `${FS}export async function f(paths: string[]) { const documents = await Promise.all(paths.map((path) => readFile(path, "utf8"))); documents.forEach((document, index) => { writeBack(paths[index]!, document); }); }\ndeclare function writeBack(path: string, text: string): void;`,
    `${FS}export async function f(paths: string[]) { for (const path of paths) { summarize(await readFile(path, "utf8")); } }${DECLARE}`,
    `${FS}export async function f() { const documents = await Promise.all(["a.json", "b.json"].map((path) => readFile(path, "utf8"))); for (const document of documents) summarize(document); }${DECLARE}`,
    `${FS}export async function f(paths: string[]) { const documents = await Promise.all(paths.map((path) => readFile(path, "utf8"))); return documents; }`,
    `${FS}export async function f(paths: string[]) { const documents = await Promise.all(paths.map((path) => readFile(path, "utf8"))); for (const document of documents) summarize(document); console.log(documents.length); }${DECLARE}`,
    `${FS}export async function f(paths: string[]) { const documents = await Promise.all(paths.map((path) => readFile(path, "utf8"))); for (const [index, document] of documents.entries()) summarize(document + String(index)); }${DECLARE}`,
    `${FS}export async function f(paths: string[]) { const documents = await Promise.all(paths.map((path) => readFile(path, "utf8"))); for (const document of documents) { summarize(document + String(documents.length)); } }${DECLARE}`,
    `${FS}export async function f(paths: string[], rounds: number[]) { const documents = await Promise.all(paths.map((path) => readFile(path, "utf8"))); for (const round of rounds) { for (const document of documents) summarize(document + String(round)); } }${DECLARE}`,
    `${FS}export async function f(paths: string[]) { const documents = await Promise.all(paths.map((path) => load(path))); for (const document of documents) summarize(document); }${DECLARE}\ndeclare function load(path: string): Promise<string>;`,
    `${FS}export function f(paths: string[]) { const texts: string[] = []; for (const path of paths) { texts.push(fs.readFileSync(path, "utf8")); } texts.sort(); for (const text of texts) summarize(text); }${DECLARE}`,
  ],
  invalid: [
    {
      code: `${FS}export async function f(paths: string[]) { const documents = await Promise.all(paths.map((path) => readFile(path, "utf8"))); for (const document of documents) summarize(document); }${DECLARE}`,
      errors: [READ_ALL('documents')],
    },
    {
      code: `${FS}export function f(paths: string[]) { const contents: string[] = []; for (const path of paths) { contents.push(fs.readFileSync(path, "utf8")); } for (const content of contents) { summarize(content); } }${DECLARE}`,
      errors: [READ_ALL('contents')],
    },
    {
      code: `${FS}export function f(paths: string[]) { const configs = paths.map((path) => JSON.parse(fs.readFileSync(path, "utf8")) as { name: string }); configs.forEach((config) => console.log(config.name)); }`,
      errors: [READ_ALL('configs')],
    },
    {
      code: `${FS}export async function f(paths: string[]) { const texts = []; for (const path of paths) texts.push(await readFile(path, "utf8")); for (const text of texts) summarize(text); }${DECLARE}`,
      errors: [READ_ALL('texts')],
    },
  ],
});
