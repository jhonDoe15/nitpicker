import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './require-tsconfig-type-roots.mts';

const tester = typescriptRuleTester();

function flagged(code: string) {
  return { code, errors: [{ messageId: 'missingTypeRoots' }] };
}

tester.run('require-tsconfig-type-roots', rule, {
  valid: [
    'import { writeFileSync } from "node:fs"; ' +
      'import { tmpdir } from "node:os"; ' +
      'import { join } from "node:path"; ' +
      'export function run(base: string, roots: string) { ' +
      'writeFileSync(join(tmpdir(), "tsconfig.json"), ' +
      'JSON.stringify({ extends: base, compilerOptions: { typeRoots: [roots] } })); }',
    'import { mkdtempSync, writeFileSync } from "node:fs"; ' +
      'import { tmpdir } from "node:os"; ' +
      'import { join } from "node:path"; ' +
      'export function run(base: string, files: string[], roots: string) { ' +
      'const dir = mkdtempSync(join(tmpdir(), "ts-")); ' +
      'const cfg = { extends: base, files, compilerOptions: { typeRoots: [roots] } }; ' +
      'writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(cfg)); }',
    'import { writeFileSync } from "node:fs"; ' +
      'import { tmpdir } from "node:os"; ' +
      'import { join } from "node:path"; ' +
      'export function run(base: string, roots: string) { ' +
      'const compilerOptions = { noEmit: true, typeRoots: [roots] }; ' +
      'writeFileSync(join(tmpdir(), "tsconfig.json"), JSON.stringify({ extends: base, compilerOptions })); }',
    'import { writeFileSync } from "node:fs"; ' +
      'import { tmpdir } from "node:os"; ' +
      'import { join } from "node:path"; ' +
      'export function run(base: string) { ' +
      'writeFileSync(join(tmpdir(), "tsconfig.json"), ' +
      'JSON.stringify({ extends: base, compilerOptions: { types: [] } })); }',
    'import { writeFileSync } from "node:fs"; ' +
      'import { tmpdir } from "node:os"; ' +
      'import { join } from "node:path"; ' +
      'export function run(base: string) { ' +
      'const emptyTypes: string[] = []; ' +
      'writeFileSync(join(tmpdir(), "tsconfig.json"), ' +
      'JSON.stringify({ extends: base, compilerOptions: { types: emptyTypes } })); }',
    'import { writeFileSync } from "node:fs"; ' +
      'import { tmpdir } from "node:os"; ' +
      'import { join } from "node:path"; ' +
      'export function run(base: string, extra: Record<string, unknown>) { ' +
      'writeFileSync(join(tmpdir(), "tsconfig.json"), ' +
      'JSON.stringify({ extends: base, compilerOptions: { ...extra, noEmit: true } })); }',
    'import { writeFileSync } from "node:fs"; ' +
      'import { tmpdir } from "node:os"; ' +
      'import { join } from "node:path"; ' +
      'export function run(base: string, compilerOptions: Record<string, unknown>) { ' +
      'writeFileSync(join(tmpdir(), "tsconfig.json"), JSON.stringify({ extends: base, compilerOptions })); }',
    'import { writeFileSync } from "node:fs"; ' +
      'import { tmpdir } from "node:os"; ' +
      'import { join } from "node:path"; ' +
      'export function run(base: string, defaults: Record<string, unknown>) { ' +
      'writeFileSync(join(tmpdir(), "tsconfig.json"), JSON.stringify({ ...defaults, extends: base })); }',
    'import { writeFileSync } from "node:fs"; ' +
      'import { tmpdir } from "node:os"; ' +
      'import { join } from "node:path"; ' +
      'export function run(base: string, roots: string) { ' +
      'writeFileSync(join(tmpdir(), "tsconfig.json"), JSON.stringify({ extends: base, typeRoots: [roots] })); }',
    'import { writeFileSync } from "node:fs"; ' +
      'import { dirname, join } from "node:path"; ' +
      'export function run(base: string, files: string[]) { ' +
      'writeFileSync(join(dirname(base), "tsconfig.check.json"), JSON.stringify({ extends: base, files })); }',
    'import { writeFileSync } from "node:fs"; ' +
      'export function run(base: string) { ' +
      'writeFileSync("./tsconfig.generated.json", JSON.stringify({ extends: base, compilerOptions: { noEmit: true } })); }',
    'import { writeFileSync } from "node:fs"; ' +
      'import { join } from "node:path"; ' +
      'export function run(projectDir: string, base: string, files: string[]) { ' +
      'writeFileSync(join(projectDir, "tmp", "tsconfig.json"), JSON.stringify({ extends: base, files })); }',
    'import { mkdtempSync, writeFileSync } from "node:fs"; ' +
      'import { tmpdir } from "node:os"; ' +
      'import { join } from "node:path"; ' +
      'export function run(files: string[]) { ' +
      'const dir = mkdtempSync(join(tmpdir(), "ts-")); ' +
      'writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true }, files })); }',
    'import { writeFileSync } from "node:fs"; ' +
      'import { tmpdir } from "node:os"; ' +
      'import { join } from "node:path"; ' +
      'export function run() { ' +
      'writeFileSync(join(tmpdir(), ".eslintrc.json"), JSON.stringify({ extends: ["eslint:recommended"], rules: {} })); }',
    'import { writeFileSync } from "node:fs"; ' +
      'import { tmpdir } from "node:os"; ' +
      'import { join } from "node:path"; ' +
      'export function run(cfg: Record<string, unknown>) { ' +
      'writeFileSync(join(tmpdir(), "tsconfig.json"), JSON.stringify(cfg)); }',
    'import { tmpdir } from "node:os"; ' +
      'import { join } from "node:path"; ' +
      'export function run(base: string, files: string[]) { ' +
      'console.log(join(tmpdir(), "tsconfig.json"), JSON.stringify({ extends: base, files })); }',
  ],
  invalid: [
    flagged(
      'import { writeFileSync } from "node:fs"; ' +
        'import { tmpdir } from "node:os"; ' +
        'import { join } from "node:path"; ' +
        'export function run(base: string) { ' +
        'writeFileSync(join(tmpdir(), "tsconfig.json"), ' +
        'JSON.stringify({ extends: base, compilerOptions: { noEmit: true } })); }',
    ),
    flagged(
      'import { mkdtempSync, writeFileSync } from "node:fs"; ' +
        'import { tmpdir } from "node:os"; ' +
        'import { join } from "node:path"; ' +
        'export function run(base: string, files: string[]) { ' +
        'const dir = mkdtempSync(join(tmpdir(), "ts-")); ' +
        'const cfg = { extends: base, files }; ' +
        'writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(cfg)); }',
    ),
    flagged(
      'import fs from "node:fs"; ' +
        'import os from "node:os"; ' +
        'import path from "node:path"; ' +
        'export function run() { ' +
        'fs.writeFileSync(path.join(os.tmpdir(), "tsconfig.json"), JSON.stringify({ extends: "./tsconfig.json" })); }',
    ),
    flagged(
      'import fs from "node:fs"; ' +
        'import os from "node:os"; ' +
        'import path from "node:path"; ' +
        'export async function run(base: string) { ' +
        'const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "check-")); ' +
        'await fs.promises.writeFile(path.join(dir, "tsconfig.json"), JSON.stringify({ extends: base, include: ["a.ts"] })); }',
    ),
    flagged(
      'import { mkdtemp, writeFile } from "node:fs/promises"; ' +
        'import { tmpdir } from "node:os"; ' +
        'import { join } from "node:path"; ' +
        'export async function run(base: string, files: string[]) { ' +
        'const dir = await mkdtemp(join(tmpdir(), "ts-")); ' +
        'const cfg = { extends: base, files }; ' +
        'const content = JSON.stringify(cfg, null, 2); ' +
        'const target = join(dir, "tsconfig.json"); ' +
        'await writeFile(target, content); }',
    ),
    flagged(
      'import { writeFileSync } from "node:fs"; ' +
        'import { tmpdir } from "node:os"; ' +
        'import { join } from "node:path"; ' +
        'export function run(base: string, files: string[]) { ' +
        'const cfg = { extends: base, files }; ' +
        'writeFileSync(join(tmpdir(), "tsconfig.json"), `${JSON.stringify(cfg, null, 2)}\\n`); }',
    ),
    flagged(
      'import { writeFileSync } from "node:fs"; ' +
        'import { tmpdir } from "node:os"; ' +
        'import { join } from "node:path"; ' +
        'export function run(base: string, files: string[]) { ' +
        'const cfg = { extends: base, files }; ' +
        'writeFileSync(join(tmpdir(), "tsconfig.json"), JSON.stringify(cfg) + "\\n"); }',
    ),
    flagged(
      'import { writeFileSync } from "node:fs"; ' +
        'export function run(base: string) { ' +
        'writeFileSync("/tmp/tsconfig.json", JSON.stringify({ extends: base, compilerOptions: { noEmit: true } })); }',
    ),
    flagged(
      'import { writeFileSync } from "node:fs"; ' +
        'export function run(base: string, id: string) { ' +
        'writeFileSync(`/tmp/${id}/tsconfig.json`, JSON.stringify({ extends: base })); }',
    ),
    flagged(
      'import { writeFileSync } from "node:fs"; ' +
        'export function run(base: string) { ' +
        'writeFileSync("/var/tmp/tsconfig.json", JSON.stringify({ extends: base, files: ["a.ts"] })); }',
    ),
    flagged(
      'import { mkdtempSync, realpathSync, writeFileSync } from "node:fs"; ' +
        'import { tmpdir } from "node:os"; ' +
        'import { join } from "node:path"; ' +
        'export function run(base: string) { ' +
        'const dir = realpathSync(mkdtempSync(join(tmpdir(), "ts-"))); ' +
        'writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ extends: base })); }',
    ),
    flagged(
      'import { mkdtempSync, writeFileSync } from "node:fs"; ' +
        'import { join } from "node:path"; ' +
        'export function run(prefix: string, base: string) { ' +
        'const dir = mkdtempSync(prefix); ' +
        'writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ extends: base, compilerOptions: {} })); }',
    ),
    flagged(
      'import { writeFileSync } from "node:fs"; ' +
        'import { tmpdir } from "node:os"; ' +
        'import { join } from "node:path"; ' +
        'export function run(base: string) { ' +
        'writeFileSync(join(tmpdir(), "tsconfig.json"), ' +
        'JSON.stringify({ extends: base, compilerOptions: { types: ["node"] } })); }',
    ),
    flagged(
      'import { writeFileSync } from "node:fs"; ' +
        'import { tmpdir } from "node:os"; ' +
        'import { join } from "node:path"; ' +
        'export function run(base: string) { ' +
        'const compilerOptions = { noEmit: true }; ' +
        'writeFileSync(join(tmpdir(), "tsconfig.json"), JSON.stringify({ extends: base, compilerOptions })); }',
    ),
    flagged(
      'import { writeFileSync } from "node:fs"; ' +
        'import { tmpdir } from "node:os"; ' +
        'import { join } from "node:path"; ' +
        'export function run(base: string, files: string[]) { ' +
        'const cfg = { extends: base, files } as const; ' +
        'writeFileSync(join(tmpdir(), "tsconfig.json"), JSON.stringify(cfg)); }',
    ),
    flagged(
      'import { mkdtempSync, writeFileSync } from "node:fs"; ' +
        'import { tmpdir } from "node:os"; ' +
        'import { join } from "node:path"; ' +
        'export function run(base: string) { ' +
        'const dir = mkdtempSync(join(tmpdir(), "ts-")); ' +
        'writeFileSync(join(dir, "check.json"), JSON.stringify({ extends: base, compilerOptions: { noEmit: true } })); }',
    ),
  ],
});
