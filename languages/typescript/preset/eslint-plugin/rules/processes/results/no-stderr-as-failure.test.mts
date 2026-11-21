import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-stderr-as-failure.mts';

const tester = typescriptRuleTester();
const CP = "import { exec, execFile, spawn, spawnSync } from 'node:child_process';";
const PROMISIFIED =
  "import { promisify } from 'node:util'; import { execFile } from 'node:child_process'; const run = promisify(execFile);";

function invalid(code: string) {
  return { code, errors: [{ messageId: 'stderrAsFailure' }] };
}

tester.run('no-stderr-as-failure', rule, {
  valid: [
    `${CP} const r = spawnSync('fmt', [], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr);`,
    `${CP} const r = spawnSync('fmt', [], { encoding: 'utf8' }); if (r.status !== 0 && r.stderr) throw new Error(r.stderr);`,
    `${CP} const r = spawnSync('fmt', [], { encoding: 'utf8' }); if (r.stderr.includes('fatal')) throw new Error(r.stderr);`,
    `${CP} const r = spawnSync('fmt', [], { encoding: 'utf8' }); if (r.stderr) console.warn(r.stderr);`,
    `${CP} const r = spawnSync('fmt', [], { encoding: 'utf8' }); if (!r.stderr) { use(r.stdout); }`,
    `${CP} const child = spawn('fmt', []); if (child.stderr) { throw new Error('no stream'); }`,
    `${CP} if (process.stderr) throw new Error('x');`,
    `${CP} export function f(result) { if (result.stderr) throw new Error(result.stderr); }`,
    `${CP} exec('make', (error, stdout, stderr) => { if (error) reject(error); else resolve(stderr); });`,
    `${CP} const r = spawnSync('fmt', []); if (r.stderr) { items.forEach(() => { throw new Error('x'); }); }`,
    `${CP} const r = spawnSync('fmt', []); if (r.stderr) { console.warn(r.stderr); if (r.status !== 0) throw new Error('x'); }`,
    `${CP} const r = spawnSync('fmt', []); if (r.stderr.length > 0) { const l = reject(lines, isNoise); use(l); }`,
    `${CP} const r = spawnSync('fmt', []); if (r.stderr.length > 0) { logger.reject(r.stderr); }`,
    `${CP} const r = spawnSync('fmt', []); if (r.stderr.length > 0) { try { x(); } catch { throw new Error('y'); } }`,
  ],
  invalid: [
    invalid(
      `${CP} const result = spawnSync('formatter', ['--check'], { encoding: 'utf8' }); if (result.stderr.length > 0) throw new Error(result.stderr);`,
    ),
    invalid(
      `${CP} const r = spawnSync('fmt', [], { encoding: 'utf8' }); if (r.stderr !== '') { throw new Error(r.stderr); }`,
    ),
    invalid(
      `${CP} const r = spawnSync('fmt', []); if (r.stderr.toString().trim()) { process.exit(1); }`,
    ),
    invalid(
      `${CP} const r = spawnSync('fmt', []); if (r.status !== 0 || r.stderr.length) throw new Error('failed');`,
    ),
    invalid(
      `${CP} const { stderr } = spawnSync('fmt', [], { encoding: 'utf8' }); if (stderr) throw new Error(stderr);`,
    ),
    invalid(
      `${CP} new Promise((resolve, reject) => exec('make', (error, stdout, stderr) => { if (error || stderr) reject(new Error(stderr)); else resolve(stdout); }));`,
    ),
    invalid(
      `${PROMISIFIED} export async function f() { const { stderr } = await run('tsc', []); if (stderr.trim().length > 0) throw new Error(stderr); }`,
    ),
    invalid(
      "import { execa } from 'execa'; export async function f() { const r = await execa('tool', [], { reject: false }); return r.stderr ? Promise.reject(new Error(r.stderr)) : r.stdout; }",
    ),
  ],
});
