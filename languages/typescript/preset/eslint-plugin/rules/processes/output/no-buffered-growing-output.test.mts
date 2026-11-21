import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-buffered-growing-output.mts';

const tester = typescriptRuleTester();
const CP =
  "import { exec, execFile, execFileSync, execSync, spawnSync } from 'node:child_process';";
const NODE_LIMIT = '1 MiB (1,048,576 bytes)';

function growing(code: string, method: string, limit = NODE_LIMIT) {
  return { code, errors: [{ messageId: 'growingOutput', data: { method, limit } }] };
}

function sized(code: string, method: string, limit: string) {
  return { code, errors: [{ messageId: 'sizedParse', data: { method, limit } }] };
}

tester.run('no-buffered-growing-output', rule, {
  valid: [
    `${CP} export const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });`,
    `${CP} export const v = () => execFileSync('git', ['--version'], { encoding: 'utf8' });`,
    `${CP} execFileSync('git', ['ls-files'], { stdio: 'inherit' });`,
    `${CP} export const f = () => execFileSync('git', ['ls-files'], { stdio: ['pipe', 'ignore', 'pipe'] });`,
    `${CP} execFileSync('git', ['ls-files']);`,
    `${CP} export const f = () => execFileSync('git', ['ls-files'], { maxBuffer: Infinity });`,
    `${CP} export const f = (size) => execFileSync('git', ['ls-files'], { maxBuffer: size });`,
    `${CP} export const f = (options) => execFileSync('git', ['ls-files'], options);`,
    `${CP} export const f = () => execFileSync('git', ['log', '-1', '--format=%H'], { encoding: 'utf8' });`,
    `${CP} export const f = () => execFileSync('git', ['log', '-n', '1'], { encoding: 'utf8' });`,
    `${CP} export const f = () => execFileSync('git', ['log', '--max-count=5'], { encoding: 'utf8' });`,
    `${CP} export const f = () => execFileSync('git', ['diff', '--quiet'], { encoding: 'utf8' });`,
    `${CP} export const f = () => execFileSync('rg', ['--version'], { encoding: 'utf8' });`,
    `${CP} export const f = () => execFileSync('du', ['-sk', '.'], { encoding: 'utf8' });`,
    `${CP} export const f = () => execFileSync('find', ['.', '-maxdepth', '0', '-print'], { encoding: 'utf8' });`,
    `${CP} export const f = () => execFileSync('git', ['ls-files', '--', 'package.json'], { encoding: 'utf8' });`,
    `${CP} export const f = () => execFileSync('git', ['ls-files', '--error-unmatch', 'a.txt'], { encoding: 'utf8' });`,
    `${CP} export const f = () => execFileSync('git', ['status', '--porcelain', '--', 'a.txt'], { encoding: 'utf8' });`,
    `${CP} export const f = () => execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: -1 });`,
    `${CP} export const f = () => execFileSync('git', ['rev-list', '--count', 'HEAD'], { encoding: 'utf8' });`,
    `${CP} export const f = () => execFileSync('git', ['rev-list', '--max-parents=0', 'HEAD'], { encoding: 'utf8' });`,
    `${CP} export const f = (p) => execFileSync('git', ['ls-tree', '--name-only', 'HEAD', '--', p], { encoding: 'utf8' });`,
    `${CP} export const f = (extra) => execFileSync('git', ['log', ...extra], { encoding: 'utf8' });`,
    `${CP} export const f = () => execSync('git log | head -5', { encoding: 'utf8' });`,
    `${CP} export const f = () => execFileSync('grep', ['-n', 'x', 'file.txt'], { encoding: 'utf8' });`,
    `${CP} export const f = () => execFileSync('ls', ['-l'], { encoding: 'utf8' });`,
    `${CP} export function f() { const r = spawnSync('git', ['ls-files']); return r.status; }`,
    `${CP} export const f = () => spawnSync('tool', [], { maxBuffer: 1024 }).stdout.length;`,
    `${CP} export const f = () => JSON.parse(execFileSync('tool', ['--json'], { encoding: 'utf8' }));`,
    `${CP} exec('git ls-files', (error) => report(error));`,
    "import { execa } from 'execa'; export async function f() { const r = await execa('git', ['ls-files'], { buffer: false }); return r.exitCode; }",
    "import { execFileSync } from 'other'; export const f = () => execFileSync('git', ['ls-files']);",
  ],
  invalid: [
    growing(
      `${CP} export const files = () => execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\\0');`,
      'execFileSync',
    ),
    growing(
      `${CP} export const f = () => execSync('git diff --name-only', { encoding: 'utf8' });`,
      'execSync',
    ),
    growing(
      `${CP} export const f = () => execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' });`,
      'execFileSync',
    ),
    growing(
      `${CP} export function f() { const r = spawnSync('find', ['.', '-name', '*.ts']); return r.stdout.toString(); }`,
      'spawnSync',
    ),
    growing(
      `${CP} export function f() { const { stdout } = spawnSync('rg', ['--files']); return stdout; }`,
      'spawnSync',
    ),
    growing(
      `${CP} export const f = () => execFileSync('grep', ['-rn', 'TODO', '.'], { maxBuffer: 10 * 1024 * 1024 });`,
      'execFileSync',
      '10,485,760 bytes',
    ),
    growing(`${CP} exec('git log --format=%H', (error, stdout) => use(stdout));`, 'exec'),
    growing(`${CP} execFile('npm', ['ls', '--all'], (error, out) => use(out));`, 'execFile'),
    growing(
      "import { promisify } from 'node:util'; import { execFile } from 'node:child_process'; const run = promisify(execFile); export async function f() { const { stdout } = await run('git', ['ls-files']); return stdout; }",
      'execFile',
    ),
    growing(
      "import { execa } from 'execa'; export async function f() { const { stdout } = await execa('git', ['ls-files']); return stdout; }",
      'execa',
      '100,000,000 bytes',
    ),
    sized(
      `${CP} export const f = () => JSON.parse(spawnSync(tool, args, { maxBuffer: 100 * 1024 * 1024 }).stdout.toString());`,
      'spawnSync',
      '104,857,600 bytes',
    ),
    sized(
      `${CP} const LIMIT = 128 * 1024 * 1024; export function f() { const out = execFileSync(tool, ['--json'], { maxBuffer: LIMIT, encoding: 'utf8' }); return JSON.parse(out); }`,
      'execFileSync',
      '134,217,728 bytes',
    ),
    sized(
      `${CP} exec(command, { maxBuffer: 1000 }, (error, stdout) => stdout.split('\\n'));`,
      'exec',
      '1,000 bytes',
    ),
  ],
});
