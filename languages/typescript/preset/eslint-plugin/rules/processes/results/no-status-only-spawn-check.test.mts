import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-status-only-spawn-check.mts';

const tester = typescriptRuleTester();
const CP = "import { spawnSync } from 'node:child_process';";

function invalid(code: string, messageId: string, status = 'status') {
  return { code, errors: [{ messageId, data: { status } }] };
}

tester.run('no-status-only-spawn-check', rule, {
  valid: [
    `${CP} const r = spawnSync('tool', []); if (Number.isInteger(r.status) && r.status) { fail(); }`,
    `${CP} const r = spawnSync('tool', []); if (r.error) throw r.error; process.exit(r.status);`,
    `${CP} const r = spawnSync('tool', []); if (r.signal) process.kill(process.pid, r.signal); process.exit(r.status);`,
    `${CP} process.exit(spawnSync('tool', []).status ?? 1);`,
    `${CP} const r = spawnSync('tool', []); if (r.status !== 0) throw new Error('tool failed: ' + r.stderr);`,
    `${CP} const r = spawnSync('tool', []); if (r.status === 0) use(r.stdout);`,
    `${CP} const r = spawnSync('tool', []); if (r.status === null) throw new Error('killed'); throw new Error(\`exit \${r.status}\`);`,
    `${CP} const r = spawnSync('tool', []); check(r); process.exit(r.status);`,
    `${CP} export function run() { return spawnSync('tool', []).status === 0; }`,
    `${CP} const { status, error } = spawnSync('tool', []); process.exit(status);`,
    "import { execa } from 'execa'; const r = await execa('tool', [], { reject: false }); if (r.failed) throw r; process.exit(r.exitCode);",
    "import { execa } from 'execa'; const r = await execa('tool', []); process.exit(r.exitCode);",
    "import { spawnSync } from 'other'; process.exit(spawnSync('tool', []).status);",
  ],
  invalid: [
    invalid(
      `${CP} process.exit(spawnSync('tool', [], { stdio: 'inherit' }).status);`,
      'exitWithNull',
    ),
    invalid(
      `${CP} const result = spawnSync('tool', []); process.exitCode = result.status;`,
      'exitWithNull',
    ),
    invalid(
      `${CP} const result = spawnSync('tool', [], { timeout: 60_000 }); if (result.status !== 0) { throw new Error(\`tool exited with \${result.status}: \${result.stderr}\`); }`,
      'nullInMessage',
    ),
    invalid(
      `${CP} const { status } = spawnSync('tool', []); if (status !== 0) throw new Error('exit code ' + status);`,
      'nullInMessage',
    ),
    invalid(
      `${CP} const r = spawnSync('tool', []); if (r.status > 0) throw new Error('failed'); use(r.stdout);`,
      'nullAsSuccess',
    ),
    invalid(
      `${CP} const r = spawnSync('tool', []); if (r.status) throw new Error('failed'); use(r.stdout);`,
      'nullAsSuccess',
    ),
    invalid(
      `${CP} const r = spawnSync('tool', []); if (!r.status) use(r.stdout);`,
      'nullAsSuccess',
    ),
    invalid(
      "import spawn from 'cross-spawn'; process.exit(spawn.sync('tool', []).status);",
      'exitWithNull',
    ),
    invalid(
      "import { execa } from 'execa'; const r = await execa('tool', [], { reject: false }); process.exit(r.exitCode);",
      'exitWithNull',
      'exitCode',
    ),
  ],
});
