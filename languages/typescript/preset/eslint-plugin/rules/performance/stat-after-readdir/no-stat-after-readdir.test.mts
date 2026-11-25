import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-stat-after-readdir.mts';

const tester = typescriptRuleTester();

const SYNC_PREAMBLE = [
  'import { readdirSync, statSync } from "node:fs";',
  'import { join } from "node:path";',
];

function syncCode(...lines: string[]) {
  return [...SYNC_PREAMBLE, ...lines].join('\n');
}

function flagged(code: string) {
  return { code, errors: [{ messageId: 'statAfterReaddir' as const }] };
}

tester.run('no-stat-after-readdir', rule, {
  valid: [
    [
      'import { readdirSync } from "node:fs";',
      'function listDirs(dir: string) {',
      '  const dirs: string[] = [];',
      '  for (const entry of readdirSync(dir, { withFileTypes: true })) {',
      '    if (entry.isDirectory()) dirs.push(entry.name);',
      '  }',
      '  return dirs;',
      '}',
    ].join('\n'),
    syncCode(
      'function followLinks(dir: string) {',
      '  for (const entry of readdirSync(dir, { withFileTypes: true })) {',
      '    if (entry.isSymbolicLink() && statSync(join(dir, entry.name)).isDirectory()) {',
      '      console.log(entry.name);',
      '    }',
      '  }',
      '}',
    ),
    syncCode(
      'function withConstOpts(dir: string) {',
      '  const opts = { withFileTypes: true } as const;',
      '  for (const entry of readdirSync(dir, opts)) {',
      '    if (entry.isSymbolicLink()) statSync(join(dir, entry.name)).isFile();',
      '  }',
      '}',
    ),
    syncCode(
      'function opaqueOpts(dir: string, opts: object) {',
      '  for (const name of readdirSync(dir, opts)) {',
      '    if (statSync(join(dir, name)).isFile()) console.log(name);',
      '  }',
      '}',
    ),
    syncCode(
      'function totalSize(dir: string) {',
      '  let total = 0;',
      '  for (const name of readdirSync(dir)) {',
      '    const info = statSync(join(dir, name));',
      '    if (info.isFile()) total += info.size;',
      '  }',
      '  return total;',
      '}',
    ),
    syncCode(
      'function mtimes(dir: string) {',
      '  return readdirSync(dir).map((name) => statSync(join(dir, name)).mtimeMs);',
      '}',
    ),
    syncCode(
      'function passStatElsewhere(dir: string, record: (s: unknown) => void) {',
      '  for (const name of readdirSync(dir)) {',
      '    const info = statSync(join(dir, name));',
      '    if (info.isDirectory()) record(info);',
      '  }',
      '}',
    ),
    syncCode(
      'function returnStat(dir: string) {',
      '  return readdirSync(dir).map((name) => statSync(join(dir, name)));',
      '}',
    ),
    syncCode(
      'function fixedLiteralArray(dir: string) {',
      '  for (const name of ["a.ts", "b.ts"]) {',
      '    if (statSync(join(dir, name)).isFile()) console.log(name);',
      '  }',
      '}',
    ),
    syncCode(
      'function fixedConstArray(dir: string) {',
      '  const names = ["index.ts", "main.ts"];',
      '  return names.filter((name) => statSync(join(dir, name)).isFile());',
      '}',
    ),
    syncCode(
      'function childManifest(dir: string) {',
      '  for (const name of readdirSync(dir)) {',
      '    if (statSync(join(dir, name, "package.json")).isFile()) console.log(name);',
      '  }',
      '}',
    ),
    syncCode(
      'function unrelatedStat(dir: string, other: string) {',
      '  for (const name of readdirSync(dir)) {',
      '    if (statSync(other).isDirectory()) console.log(name);',
      '  }',
      '}',
    ),
    syncCode(
      'function existenceOnly(dir: string) {',
      '  for (const name of readdirSync(dir)) {',
      '    statSync(join(dir, name));',
      '  }',
      '}',
    ),
  ],
  invalid: [
    flagged(
      syncCode(
        'function listDirs(dir: string) {',
        '  for (const name of readdirSync(dir)) {',
        '    if (statSync(join(dir, name)).isDirectory()) console.log(name);',
        '  }',
        '}',
      ),
    ),
    flagged(
      [
        'import { readdir, stat } from "node:fs/promises";',
        'import path from "node:path";',
        'async function listFiles(dir: string) {',
        '  for (const name of await readdir(dir)) {',
        '    const info = await stat(path.resolve(dir, name));',
        '    if (info.isFile()) console.log(name);',
        '  }',
        '}',
      ].join('\n'),
    ),
    flagged(
      [
        'import * as fs from "node:fs";',
        'function listLinks(dir: string) {',
        '  for (const name of fs.readdirSync(dir)) {',
        '    if (fs.lstatSync(`${dir}/${name}`).isSymbolicLink()) console.log(name);',
        '  }',
        '}',
      ].join('\n'),
    ),
    flagged(
      [
        'import * as fs from "node:fs";',
        'async function listAsync(dir: string) {',
        '  const entries = await fs.promises.readdir(dir);',
        '  for (const name of entries) {',
        '    if ((await fs.promises.stat(dir + "/" + name)).isDirectory()) console.log(name);',
        '  }',
        '}',
      ].join('\n'),
    ),
    flagged(
      [
        'import { promises } from "node:fs";',
        'import { join } from "node:path";',
        'async function checkBoth(dir: string) {',
        '  for (const name of await promises.readdir(dir)) {',
        '    const full = join(dir, name);',
        '    const info = await promises.lstat(full);',
        '    if (info.isDirectory() || info.isFile()) console.log(name);',
        '  }',
        '}',
      ].join('\n'),
    ),
    flagged(
      syncCode(
        'function indexedVar(dir: string) {',
        '  const entries = readdirSync(dir);',
        '  for (let i = 0; i < entries.length; i += 1) {',
        '    const name = entries[i];',
        '    if (statSync(join(dir, name)).isFile()) console.log(name);',
        '  }',
        '}',
      ),
    ),
    flagged(
      syncCode(
        'function indexedDirect(dir: string) {',
        '  const entries = readdirSync(dir);',
        '  for (let i = 0; i < entries.length; i += 1) {',
        '    if (statSync(join(dir, entries[i])).isDirectory()) console.log(i);',
        '  }',
        '}',
      ),
    ),
    flagged(
      syncCode(
        'function forEachCase(dir: string) {',
        '  readdirSync(dir).forEach((name) => {',
        '    const full = join(dir, name);',
        '    if (statSync(full).isDirectory()) console.log(name);',
        '  });',
        '}',
      ),
    ),
    flagged(
      syncCode(
        'function filterCase(dir: string) {',
        '  return readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile());',
        '}',
      ),
    ),
    flagged(
      [
        'import { readdir, stat } from "node:fs/promises";',
        'import { join } from "node:path";',
        'async function mapCase(dir: string) {',
        '  const entries = await readdir(dir);',
        '  return Promise.all(entries.map(async (name) => (await stat(join(dir, name))).isDirectory()));',
        '}',
      ].join('\n'),
    ),
    flagged(
      syncCode(
        'function someCase(dir: string) {',
        '  return readdirSync(dir, { encoding: "utf8" }).some((name) => statSync(join(dir, name)).isDirectory());',
        '}',
      ),
    ),
    flagged(
      syncCode(
        'function everyCase(dir: string) {',
        '  return readdirSync(dir, { withFileTypes: false }).every((name) => statSync(join(dir, name)).isFile());',
        '}',
      ),
    ),
    flagged(
      syncCode(
        'function flatMapCase(dir: string) {',
        '  return readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? [name] : []));',
        '}',
      ),
    ),
    flagged(
      syncCode(
        'function findCase(dir: string) {',
        '  return readdirSync(dir).find((name) => statSync(join(dir, name)).isSymbolicLink());',
        '}',
      ),
    ),
    flagged(
      syncCode(
        'function guardedCase(dir: string) {',
        '  for (const name of readdirSync(dir)) {',
        '    const info = statSync(join(dir, name), { throwIfNoEntry: false });',
        '    if (info && info.isFile()) console.log(name);',
        '  }',
        '}',
      ),
    ),
    flagged(
      syncCode(
        'function sortedChain(dir: string) {',
        '  readdirSync(dir)',
        '    .sort()',
        '    .forEach((name) => {',
        '      if (statSync(join(dir, name), { throwIfNoEntry: false })?.isDirectory()) console.log(name);',
        '    });',
        '}',
      ),
    ),
    flagged(
      [
        'import * as fs from "node:fs";',
        'import { join } from "node:path";',
        'function thenChain(dir: string) {',
        '  return fs.promises',
        '    .readdir(dir)',
        '    .then((entries) => entries.filter((name) => fs.statSync(join(dir, name)).isFile()));',
        '}',
      ].join('\n'),
    ),
  ],
});
