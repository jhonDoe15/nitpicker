import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/async/no-sync-node-api-in-async.mts';
import { declines, fixes } from './test-support/sync-fs-cases.mts';

const FSE = "import fse from 'fs-extra';\n";

function twin(name: string, args: string, output: string) {
  return fixes(
    `${FSE}export async function f(p: string) { fse.${name}Sync(${args}); }`,
    `${FSE}export async function f(p: string) { await fse.${output}(${args}); }`,
  );
}

typescriptRuleTester().run('fs-extra fixes', rule, {
  valid: [],
  invalid: [
    twin('ensureDir', 'p', 'ensureDir'),
    twin('ensureFile', 'p', 'ensureFile'),
    twin('copy', `p, \`\${p}.bak\``, 'copy'),
    twin('copy', 'p, p + "2", { overwrite: false }', 'copy'),
    twin('move', 'p, p + "2", { overwrite: true }', 'move'),
    twin('remove', 'p', 'remove'),
    twin('emptyDir', 'p', 'emptyDir'),
    twin('outputFile', 'p, "text"', 'outputFile'),
    twin('writeJson', 'p, { a: 1 }, { spaces: 2 }', 'writeJson'),
    twin('outputJson', 'p, { a: 1 }', 'outputJson'),
    twin('mkdirs', 'p', 'mkdirs'),
    twin('mkdirp', 'p', 'mkdirp'),
    twin('pathExists', 'p', 'pathExists'),
    fixes(
      `${FSE}export async function f(p: string) { return fse.readJsonSync(p); }`,
      `${FSE}export async function f(p: string) { return await fse.readJson(p); }`,
    ),
    fixes(
      `${FSE}export async function f(p: string) { return fse.readJsonSync(p, { throws: false }).name; }`,
      `${FSE}export async function f(p: string) { return (await fse.readJson(p, { throws: false })).name; }`,
    ),
    fixes(
      `${FSE}export async function f(p: string) { if (!fse.existsSync(p)) return 1; return 2; }`,
      `${FSE}export async function f(p: string) { if (!(await fse.pathExists(p))) return 1; return 2; }`,
    ),
    fixes(
      `${FSE}export async function f(p: string) { if (fse.pathExistsSync(p)) return 1; return 2; }`,
      `${FSE}export async function f(p: string) { if (await fse.pathExists(p)) return 1; return 2; }`,
    ),
    fixes(
      `import * as fs from 'fs-extra';\nexport async function f(p: string) { fs.removeSync(p); }`,
      `import * as fs from 'fs-extra';\nexport async function f(p: string) { await fs.remove(p); }`,
    ),
    fixes(
      `const fse = require('fs-extra');\nexports.f = async (p) => fse.ensureDirSync(p);`,
      `const fse = require('fs-extra');\nexports.f = async (p) => await fse.ensureDir(p);`,
    ),
  ],
});

typescriptRuleTester().run('fs-extra declines', rule, {
  valid: [],
  invalid: [
    declines(`${FSE}export async function f(p: string) { return fse.readFileSync(p); }`),
    declines(`${FSE}export async function f(p: string) { return fse.statSync(p); }`),
    declines(`${FSE}export async function f(p: string) { return fse.copyFileSync(p, p); }`),
    declines(`${FSE}export async function f(p: string) { fse.ensureDirSync(...[p]); }`),
    declines(`${FSE}export async function f(p: string) { fse.ensureDirSync(/* x */ p); }`),
    declines(
      `${FSE}export async function f(ps: string[]) { ps.forEach((p) => fse.ensureDirSync(p)); }`,
    ),
    declines(
      `import { ensureDirSync } from 'fs-extra';\nexport async function f(p: string) { ensureDirSync(p); }`,
    ),
    declines(
      `import { pathExistsSync } from 'fs-extra';\nexport async function f(p: string) { return pathExistsSync(p); }`,
    ),
    declines(`${FSE}export async function f(p: string) { return fse['removeSync'](p); }`),
    declines(`${FSE}export async function f(p: string) { fse.removeSync?.(p); }`),
    declines(`${FSE}export async function f(p: string) { fse.ensureDirSync(p, 1, 2, 3); }`),
    declines(`${FSE}process.on('SIGTERM', async () => { fse.removeSync('/tmp/lock'); });`),
    declines(
      `${FSE}let ready = false;\nexport async function f(p: string) { if (!ready) { fse.ensureDirSync(p); ready = true; } }`,
    ),
  ],
});
