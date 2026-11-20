import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-wrapper-only-timeout.mts';

const tester = typescriptRuleTester();
const CP =
  "import { exec, execFile, execFileSync, execSync, spawn, spawnSync } from 'node:child_process';";

function invalid(code: string, wrapper: string) {
  return { code, errors: [{ messageId: 'wrapperOnlyTimeout', data: { wrapper } }] };
}

tester.run('no-wrapper-only-timeout', rule, {
  valid: [
    `${CP} spawnSync('git', ['status'], { timeout: 60_000 });`,
    `${CP} execFileSync('java', ['-jar', 'tool.jar'], { timeout: 60_000 });`,
    `${CP} execSync('git status --porcelain', { timeout: 10_000 });`,
    `${CP} exec('make', { timeout: 30_000 }, done);`,
    `${CP} spawnSync('gradlew.bat', ['check']);`,
    `${CP} execSync('npm run build');`,
    `${CP} export const run = (options) => spawnSync('gradlew.bat', ['check'], options);`,
    `${CP} spawnSync('gradlew.bat', ['check'], { timeout: 0 });`,
    `${CP} export function run() { const child = spawn('npm', ['run', 'build'], { detached: true, timeout: 60_000 }); setTimeout(() => process.kill(-child.pid, 'SIGKILL'), 60_000); return child; }`,
    `${CP} spawnSync('node', ['script.js'], { shell: true, timeout: 1000 });`,
    `${CP} execFileSync('./gradlew', ['check'], { timeout: 60_000 });`,
    `${CP} execFileSync('./mvnw', ['verify'], { timeout: 60_000 });`,
    `${CP} execSync('curl "https://x/?a=1&b=2"', { timeout: 5000 });`,
    `${CP} execSync('git log --grep="fix|bug"', { timeout: 5000 });`,
    `${CP} execSync('git status 2>&1', { timeout: 5000 });`,
    `${CP} spawnSync('bash', ['--version'], { timeout: 5000 });`,
    `${CP} spawnSync('npm', ['run', 'build'], { timeout: undefined });`,
    `${CP} spawnSync('npm', ['run', 'build'], { timeout: null, signal: null });`,
    `${CP} spawnSync('npm', ['run', 'build'], { timeout: Infinity });`,
    `${CP} execSync('npm view nx dist-tags --json', { timeout: 30_000 });`,
    `${CP} execFileSync('pnpm', ['install', '--frozen-lockfile'], { timeout: 30_000 });`,
    `${CP} execFileSync('sh', ['-c', 'make test'], { timeout: 60_000 });`,
    `${CP} export const run = (script) => execFileSync('bash', ['-lc', script], { timeout: 60_000 });`,
    "import { execaCommand } from 'execa'; await execaCommand('npm run build', { timeout: 1000 });",
    "import { spawnSync } from 'other'; spawnSync('gradlew.bat', ['check'], { timeout: 1000 });",
  ],
  invalid: [
    invalid(
      `${CP} spawnSync('gradlew.bat', ['check'], { timeout: 15 * 60_000 });`,
      '`gradlew.bat`',
    ),
    invalid(`${CP} exec('npm run build', { timeout: 60_000 }, done);`, '`npm`'),
    invalid(
      `${CP} execFileSync('pnpm', ['--filter', 'app', 'test'], { timeout: 60_000 });`,
      '`pnpm`',
    ),
    invalid(`${CP} execSync('cd app && make test', { timeout: 60_000 });`, 'a shell'),
    invalid(
      `${CP} execSync('./scripts/build.sh --all', { timeout: 60_000 });`,
      '`./scripts/build.sh`',
    ),
    invalid(`${CP} execFileSync('bash', ['scripts/run'], { timeout: 60_000 });`, '`bash`'),
    invalid(`${CP} execFileSync('sh', ['-c', 'make && make test'], { timeout: 60_000 });`, '`sh`'),
    invalid(
      `${CP} execFile('scripts/build.sh', [], { signal: AbortSignal.timeout(1000) }, done);`,
      '`scripts/build.sh`',
    ),
    invalid(`${CP} spawn('mvnw.cmd', ['verify'], { timeout: 1000 });`, '`mvnw.cmd`'),
    invalid(`${CP} spawnSync('make build | tee log', { shell: true, timeout: 1000 });`, 'a shell'),
    invalid(
      `${CP} spawnSync('npx', ['vitest', 'run'], { detached: true, timeout: 1000 });`,
      '`npx`',
    ),
    invalid(
      "import { execa } from 'execa'; await execa('yarn', ['run', 'build'], { timeout: 1000 });",
      '`yarn`',
    ),
  ],
});
