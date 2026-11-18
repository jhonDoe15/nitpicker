import { typescriptRuleTester, configuredRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/async/no-sync-node-api-in-async.mts';
import tseslint from 'typescript-eslint';
import { declines, fixes } from './sync-fs-test-support.mts';

const READ = "import { readFileSync } from 'node:fs';\n";
const PROMISES = "import { readFile } from 'node:fs/promises';\n";

typescriptRuleTester().run('named fs import fixes', rule, {
  valid: [],
  invalid: [
    fixes(
      `${READ}export async function r(p: string) { return JSON.parse(readFileSync('a.txt', 'utf8')); }`,
      `${READ}${PROMISES}export async function r(p: string) { return JSON.parse(await readFile('a.txt', 'utf8')); }`,
    ),
    fixes(
      `import { readFileSync } from 'node:fs';\nimport { writeFile } from 'node:fs/promises';\nexport async function r(p: string) { return readFileSync('a.txt'); }`,
      `import { readFileSync } from 'node:fs';\nimport { writeFile, readFile } from 'node:fs/promises';\nexport async function r(p: string) { return await readFile('a.txt'); }`,
    ),
    fixes(
      `${READ}${PROMISES}export async function r(p: string) { return readFileSync('a.txt'); }`,
      `${READ}${PROMISES}export async function r(p: string) { return await readFile('a.txt'); }`,
    ),
    fixes(
      `import { readFileSync as read } from "node:fs";\nexport async function r(p: string) { return read('a.txt'); }`,
      `import { readFileSync as read } from "node:fs";\nimport { readFile } from "node:fs/promises";\nexport async function r(p: string) { return await readFile('a.txt'); }`,
    ),
    fixes(
      `import { readFileSync } from 'fs';\nexport async function r(p: string) { return readFileSync('a.txt'); }`,
      `import { readFileSync } from 'fs';\nimport { readFile } from 'fs/promises';\nexport async function r(p: string) { return await readFile('a.txt'); }`,
    ),
    fixes(
      `import { readFileSync, writeFileSync } from 'node:fs';\nexport async function r(p: string) { writeFileSync('a.txt', 'x'); return 1; }`,
      `import { readFileSync, writeFileSync } from 'node:fs';\nimport { writeFile } from 'node:fs/promises';\nexport async function r(p: string) { await writeFile('a.txt', 'x'); return 1; }`,
    ),
    fixes(
      `import fs, { readdirSync } from 'node:fs';\nexport async function r(d: string) { return readdirSync(d).map((n) => n.length); }`,
      `import fs, { readdirSync } from 'node:fs';\nimport { readdir } from 'node:fs/promises';\nexport async function r(d: string) { return (await readdir(d)).map((n) => n.length); }`,
    ),
    fixes(
      `import fsp from 'node:fs/promises';\nimport { mkdirSync } from 'node:fs';\nexport async function r(d: string) { mkdirSync(d, { recursive: true }); }`,
      `import fsp from 'node:fs/promises';\nimport { mkdirSync } from 'node:fs';\nimport { mkdir } from 'node:fs/promises';\nexport async function r(d: string) { await mkdir(d, { recursive: true }); }`,
    ),
    fixes(
      `import { statSync } from 'node:fs';\nexport async function r(d: string) { return statSync(d).isFile(); }`,
      `import { statSync } from 'node:fs';\nimport { stat } from 'node:fs/promises';\nexport async function r(d: string) { return (await stat(d)).isFile(); }`,
    ),
    fixes(
      `'use strict';\nimport { rmSync } from 'node:fs';\nexport async function r(d: string) { rmSync(d, { recursive: true, force: true }); }`,
      `'use strict';\nimport { rmSync } from 'node:fs';\nimport { rm } from 'node:fs/promises';\nexport async function r(d: string) { await rm(d, { recursive: true, force: true }); }`,
    ),
    fixes(
      `import { readFileSync } from 'node:fs';\nimport { readFile as read } from 'node:fs/promises';\nexport async function r(p: string) { return readFileSync('a.txt'); }`,
      `import { readFileSync } from 'node:fs';\nimport { readFile as read, readFile } from 'node:fs/promises';\nexport async function r(p: string) { return await readFile('a.txt'); }`,
    ),
    fixes(
      `import { unlinkSync } from 'node:fs';\nexport async function r(ps: string[]) { for (const p of ps) { unlinkSync(p); } }`,
      `import { unlinkSync } from 'node:fs';\nimport { unlink } from 'node:fs/promises';\nexport async function r(ps: string[]) { for (const p of ps) { await unlink(p); } }`,
    ),
    fixes(
      `import { realpathSync } from 'node:fs';\nexport async function r(p: string) { return realpathSync(p); }`,
      `import { realpathSync } from 'node:fs';\nimport { realpath } from 'node:fs/promises';\nexport async function r(p: string) { return await realpath(p); }`,
    ),
  ],
});

typescriptRuleTester().run('named fs import declines', rule, {
  valid: [],
  invalid: [
    declines(
      `${READ}const readFile = (x: string) => x;\nexport async function r(p: string) { return readFileSync('a.txt') + readFile('a.txt'); }`,
    ),
    declines(
      `${READ}export async function r(p: string) { const readFile = 1; return readFileSync('a.txt') + readFile; }`,
    ),
    declines(
      `${READ}export async function r(p: string) { return readFileSync('a.txt'); }\nexport function readFile() { return 1; }`,
    ),
    declines(
      `${READ}import { readFile } from 'fs';\nexport async function r(p: string) { return readFileSync('a.txt') + String(readFile); }`,
    ),
    declines(
      `${READ}import { readFile } from 'other';\nexport async function r(p: string) { return readFileSync('a.txt') + String(readFile); }`,
    ),
    declines(`${READ}export async function r(p: string) { return readFileSync(0); }`),
    declines(
      `${READ}export async function r(ps: string[]) { return ps.map((p) => readFileSync('a.txt')); }`,
    ),
    declines(
      `import { statSync } from 'node:fs';\nexport async function r(p: string) { return statSync(p, { throwIfNoEntry: false }); }`,
    ),
    declines(
      `import { openSync, closeSync } from 'node:fs';\nexport async function r(p: string) { const fd = openSync(p, 'r'); closeSync(fd); }`,
      2,
    ),
    declines(`${READ}export async function r(p: string) { return readFileSync(/* x */ p); }`),
    declines(
      `import { readFileSync } from 'graceful-fs';\nexport async function r(p: string) { return readFileSync('a.txt'); }`,
    ),
    declines(
      `import { readFileSync } from 'node:fs';\nexport async function r(p: string) { return readFileSync(...[p]); }`,
    ),
  ],
});

configuredRuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', parser: tseslint.parser },
}).run('named fs fixes in CommonJS', rule, {
  valid: [],
  invalid: [
    declines(
      `const { readFileSync } = require('node:fs');\nexports.r = async (p) => readFileSync('a.txt');`,
    ),
    declines(
      `const fs = require('node:fs');\nconst { readFileSync } = fs;\nexports.r = async (p) => readFileSync('a.txt');`,
    ),
  ],
});
