import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-stat-per-listed-entry.mts';

const tester = typescriptRuleTester();
const cases = (block: string) => block.trim().split('\n\n');

const STAT = (call: string) => ({ messageId: 'statPerEntry', data: { call } });
const SYNC =
  "import { lstatSync, readdirSync, statSync } from 'node:fs';\nimport { join } from 'node:path';";
const ASYNC =
  "import { readdir, stat } from 'node:fs/promises';\nimport { join } from 'node:path';";

tester.run('no-stat-per-listed-entry', rule, {
  valid: [
    ...cases(`
export function f(dir: string) { for (const name of readdirSync(dir)) {
  if (statSync(dir + name).isDirectory()) use(name); } }
declare function readdirSync(d: string): string[];
declare function statSync(p: string): { isDirectory(): boolean };
declare function use(n: string): void;
`),
    `${SYNC}\nexport function f(dir: string) { for (const name of readdirSync(dir)) {
      if (statSync(join(dir, name, "package.json")).isFile()) use(name); } }\ndeclare function use(n: string): void;`,
    `${SYNC}\nexport function walk(dir: string) { for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name)); } }`,
    `${SYNC}\nexport function sizes(dir: string) {
      return readdirSync(dir).map((name) => statSync(join(dir, name)).size); }`,
    `${SYNC}\nexport function f(dir: string) { for (const name of readdirSync(dir)) {
      const info = statSync(join(dir, name)); if (info.isFile()) use(info.mtimeMs); }
        }\ndeclare function use(n: number): void;`,
    `${SYNC}\nexport function f(dir: string, names: string[]) { for (const name of names) {
      if (statSync(join(dir, name)).isDirectory()) use(name); } }\ndeclare function use(n: string): void;`,
    `${SYNC}\nexport function f(dir: string, other: string) { for (const name of readdirSync(dir)) {
      if (statSync(other).isDirectory()) use(name); } }\ndeclare function use(n: string): void;`,
  ],
  invalid: [
    {
      code: `${SYNC}\nexport function walk(dir: string) { for (const name of readdirSync(dir)) { if (statSync(join(dir, name)).isDirectory()) walk(join(dir, name)); } }`,
      errors: [STAT('statSync')],
    },
    {
      code: `${SYNC}\nexport function files(dir: string) { const names = readdirSync(dir); return names.filter((name) => lstatSync(join(dir, name)).isFile()); }`,
      errors: [STAT('lstatSync')],
    },
    {
      code: `${ASYNC}\nexport async function walk(dir: string) { for (const name of await readdir(dir)) { const info = await stat(join(dir, name)); if (info.isDirectory()) await walk(join(dir, name)); } }`,
      errors: [STAT('stat')],
    },
    {
      code: "import fs from 'node:fs';\nexport function f(dir: string) { for (const name of fs.readdirSync(dir, 'utf8')) { if (fs.statSync(dir + '/' + name).isDirectory()) use(name); } }\ndeclare function use(n: string): void;",
      errors: [STAT('fs.statSync')],
    },
  ],
});
