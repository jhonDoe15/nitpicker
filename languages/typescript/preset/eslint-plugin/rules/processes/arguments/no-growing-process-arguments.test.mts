import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-growing-process-arguments.mts';

const tester = typescriptRuleTester();
const CP =
  "import { execFileSync, execSync, spawn, spawnSync } from 'node:child_process'; import path from 'node:path'; import { readdirSync } from 'node:fs'; import fg from 'fast-glob';";

function invalid(code: string, messageId = 'joinedList') {
  return { code, errors: [{ messageId }] };
}

tester.run('no-growing-process-arguments', rule, {
  valid: [
    `${CP} spawnSync('eslint', ['--format', 'json', ...changedFiles], { timeout: 1 });`,
    `${CP} spawnSync('tool', ['--dirs', dirs.join(',')]);`,
    `${CP} spawnSync('java', ['-cp', [libDir, classesDir].join(path.delimiter), 'Main']);`,
    `${CP} spawnSync('java', ['Main'], { env: { CLASSPATH: classpath.join(path.delimiter) } });`,
    `${CP} for (const chunk of chunks(readdirSync(dir), 200)) spawnSync('tool', [...chunk]);`,
    `${CP} spawnSync('tool', [\`@\${argsFile}\`]);`,
    `${CP} const delimiter = ','; spawnSync('tool', [items.join(delimiter)]);`,
    `${CP} spawnSync('tool', [...readdirSync(dir).slice(0, 10)]);`,
    `${CP} export const f = (opts, root) => spawnSync('node', ['--x', [...opts.extraDirs, root].join(path.delimiter)]);`,
    `${CP} export const f = (db) => spawnSync('tool', [...db.readdir('a')]);`,
    `${CP} export const f = (arr) => spawnSync('tool', [...arr.fg('a')]);`,
    `${CP} export class A { run() { spawnSync('tool', [...this.glob()]); } }`,
    `${CP} const a = b; const b = a; spawnSync('x', [...a]);`,
    "import { spawnSync } from 'other'; import { readdirSync } from 'node:fs'; spawnSync('tool', [...readdirSync('.')]);",
  ],
  invalid: [
    invalid(`${CP} spawnSync('java', ['-cp', classpath.join(path.delimiter), 'Main']);`),
    invalid(
      `${CP} const cp = jars.map((jar) => jar.path).join(path.delimiter); execFileSync('javac', ['-cp', cp, 'A.java']);`,
    ),
    invalid(
      `${CP} spawnSync('prettier', ['--check', ...readdirSync(dir).filter((name) => name.endsWith('.ts'))]);`,
      'spreadListing',
    ),
    invalid(
      `${CP} export async function f() { const files = await fg('**/*.ts'); spawn('eslint', ['--format', 'json', ...files]); }`,
      'spreadListing',
    ),
    invalid(`${CP} execSync(\`tsc \${readdirSync('src').join(' ')}\`);`),
    invalid(
      `${CP} const files = fg.sync('**/*.java'); spawnSync('tool', ['--sources', files.join(',')]);`,
    ),
    invalid(
      "import { delimiter } from 'node:path'; import { spawnSync } from 'node:child_process'; spawnSync('java', ['-cp', entries.join(delimiter)]);",
    ),
  ],
});
