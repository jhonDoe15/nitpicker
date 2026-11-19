import { typescriptRuleTester, configuredRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/async/no-sync-node-api-in-async.mts';
import tseslint from 'typescript-eslint';
import { declines, fixes, FS } from './test-support/sync-fs-cases.mts';

const CHECK = '.then(() => true, () => false)';
const NAMED = 'import { existsSync } from "node:fs";\n';
const ACCESS = `import { existsSync } from "node:fs";\nimport { access } from "node:fs/promises";\n`;

function exists(code: string, output: string) {
  return fixes(code, output, 'awaitAccess');
}

typescriptRuleTester().run('existsSync fixes', rule, {
  valid: [],
  invalid: [
    exists(
      `${FS}export async function f(p: string) { if (!fs.existsSync(p)) return null; return 1; }`,
      `${FS}export async function f(p: string) { if (!(await fs.promises.access(p)${CHECK})) return null; return 1; }`,
    ),
    exists(
      `${FS}export async function f(p: string) { if (fs.existsSync(p)) return 1; return 2; }`,
      `${FS}export async function f(p: string) { if (await fs.promises.access(p)${CHECK}) return 1; return 2; }`,
    ),
    exists(
      `${FS}export async function h(p: string, ok: boolean) { return ok && fs.existsSync(p) ? 1 : 2; }`,
      `${FS}export async function h(p: string, ok: boolean) { return ok && await fs.promises.access(p)${CHECK} ? 1 : 2; }`,
    ),
    exists(
      `${FS}export async function h(p: string, q: boolean) { return fs.existsSync(p) || q; }`,
      `${FS}export async function h(p: string, q: boolean) { return await fs.promises.access(p)${CHECK} || q; }`,
    ),
    exists(
      `${FS}export async function h(p: string) { return fs.existsSync(p) ? 'yes' : 'no'; }`,
      `${FS}export async function h(p: string) { return await fs.promises.access(p)${CHECK} ? 'yes' : 'no'; }`,
    ),
    exists(
      `${FS}export async function h(p: string) { const found = fs.existsSync(p); return found; }`,
      `${FS}export async function h(p: string) { const found = await fs.promises.access(p)${CHECK}; return found; }`,
    ),
    exists(
      `${FS}export async function h(p: string) { return !!fs.existsSync(p); }`,
      `${FS}export async function h(p: string) { return !!(await fs.promises.access(p)${CHECK}); }`,
    ),
    exists(
      `${FS}export async function h(p: string) { return await fs.existsSync(p); }`,
      `${FS}export async function h(p: string) { return await fs.promises.access(p)${CHECK}; }`,
    ),
    exists(
      `${FS}export async function h(p: string, d: string) { return fs.existsSync(\`\${d}/\${p}\`); }`,
      `${FS}export async function h(p: string, d: string) { return await fs.promises.access(\`\${d}/\${p}\`)${CHECK}; }`,
    ),
    exists(
      `${FS}export async function h(p: string) { while (!fs.existsSync(p)) { break; } }`,
      `${FS}export async function h(p: string) { while (!(await fs.promises.access(p)${CHECK})) { break; } }`,
    ),
    exists(
      `${NAMED}export async function h(p: string) { return existsSync(p); }`,
      `import { existsSync } from "node:fs";\nimport { access } from "node:fs/promises";\nexport async function h(p: string) { return await access(p)${CHECK}; }`,
    ),
    exists(
      `${NAMED}export async function h(p: string) { if (!existsSync(p)) { return 1; } return 2; }`,
      `import { existsSync } from "node:fs";\nimport { access } from "node:fs/promises";\nexport async function h(p: string) { if (!(await access(p)${CHECK})) { return 1; } return 2; }`,
    ),
    exists(
      `import { existsSync as has } from 'fs';\nexport async function h(p: string) { return has(p); }`,
      `import { existsSync as has } from 'fs';\nimport { access } from 'fs/promises';\nexport async function h(p: string) { return await access(p)${CHECK}; }`,
    ),
    exists(
      `import { existsSync } from 'node:fs';\nimport { readFile } from 'node:fs/promises';\nexport async function h(p: string) { return existsSync(p); }`,
      `import { existsSync } from 'node:fs';\nimport { readFile, access } from 'node:fs/promises';\nexport async function h(p: string) { return await access(p)${CHECK}; }`,
    ),
    exists(
      `${ACCESS}export async function h(p: string) { return existsSync(p); }`,
      `${ACCESS}export async function h(p: string) { return await access(p)${CHECK}; }`,
    ),
    exists(
      `import fsDefault from 'node:fs';\nexport async function h(p: string) { return fsDefault.existsSync(p); }`,
      `import fsDefault from 'node:fs';\nexport async function h(p: string) { return await fsDefault.promises.access(p)${CHECK}; }`,
    ),
    exists(
      `const fs = require('fs');\nexports.h = async (p) => fs.existsSync(p);`,
      `const fs = require('fs');\nexports.h = async (p) => await fs.promises.access(p)${CHECK};`,
    ),
  ],
});

typescriptRuleTester().run('existsSync declines', rule, {
  valid: [],
  invalid: [
    declines(
      `${NAMED}const access = 1;\nexport async function h(p: string) { return existsSync(p) && access; }`,
    ),
    declines(
      `${NAMED}export async function h(p: string) { const access = 1; return existsSync(p) && access; }`,
    ),
    declines(`${NAMED}export async function h(p: string[]) { return existsSync(...p); }`),
    declines(`${NAMED}export async function h(p: string) { return existsSync(p, 1); }`),
    declines(`${NAMED}export async function h(p: string) { return existsSync(/* x */ p); }`),
    declines(
      `${NAMED}export async function h(ps: string[]) { return ps.filter((p) => existsSync(p)); }`,
    ),
    declines(
      `${NAMED}export async function h(ps: string[]) { return ps.find((p) => existsSync(p)); }`,
    ),
    declines(
      `${NAMED}let ready = false;\nexport async function h(p: string) { if (!ready) { ready = existsSync(p); } return ready; }`,
    ),
    declines(
      `import { existsSync } from "node:fs";\nexport async function h(p: string) { return existsSync(p); }\nexport function access() { return 1; }`,
    ),
    declines(`${NAMED}process.on('exit', async () => { existsSync('/tmp/x'); });`),
    declines(
      `import { existsSync } from "node:fs";\nimport { access } from "other";\nexport async function h(p: string) { return existsSync(p) && access; }`,
    ),
    declines(
      `import fs from "node:fs";\nexport async function h(p: string) { return fs["existsSync"](p); }`,
    ),
  ],
});

configuredRuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', parser: tseslint.parser },
}).run('existsSync in CommonJS', rule, {
  valid: [],
  invalid: [
    declines(`const { existsSync } = require('node:fs');\nexports.h = async (p) => existsSync(p);`),
  ],
});
