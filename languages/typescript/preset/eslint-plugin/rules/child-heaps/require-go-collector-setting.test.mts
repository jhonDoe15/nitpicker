import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './require-go-collector-setting.mts';

const tester = typescriptRuleTester();
const CP = "import { spawn, execFile } from 'node:child_process';";

function invalid(code: string) {
  return { code: `${CP} ${code}`, errors: [{ messageId: 'noCollectorSetting' }] };
}

tester.run('require-go-collector-setting', rule, {
  valid: [
    `${CP} spawn('tsgo', ['--api'], { env: { ...process.env, GOGC: '50' } });`,
    `${CP} spawn(tsgolintPath, ['run'], { env: { ...process.env, GOMEMLIMIT: '2GiB' } });`,
    `${CP} spawn('node', ['server.js'], { stdio: 'pipe' });`,
    `${CP} export const f = (options) => spawn('tsgo', ['--api'], options);`,
    `${CP} export const f = (env) => spawn('gopls', [], { env: { ...env } });`,
    `${CP} export const f = (env) => spawn('gopls', [], { env });`,
    `${CP} spawn('tsgo', ['--version']);`,
    `${CP} spawn('node', ['server.js', '--api']);`,
    `${CP} spawn('tsgo', ['--api'], { env: { ...process.env, GOGC: process.env.GOGC ?? '50' } });`,
    `import { spawn } from 'other'; spawn('tsgo', ['--api']);`,
  ],
  invalid: [
    invalid(
      "export const f = (compilerPath, folder) => spawn(compilerPath, ['--api', '--cwd', folder], { stdio: 'pipe' });",
    ),
    invalid("spawn('tsgolint', ['headless']);"),
    invalid("execFile('gopls', ['serve'], (error) => done(error));"),
    invalid("spawn('tsgo', ['--api'], { env: process.env });"),
    invalid("spawn('tsgo', ['--api'], { env: { ...process.env, GOGC: undefined } });"),
    invalid(
      "execFile('/repo/node_modules/.bin/gopls', ['serve'], { env: { ...process.env } }, done);",
    ),
    invalid(
      "export const f = (tsgoPath) => spawn(tsgoPath, ['--lsp'], { env: { ...process.env, NODE_ENV: 'x' } });",
    ),
    invalid(
      'const bin = `${root}/node_modules/@typescript/native-preview/bin/tsgo`; spawn(bin, []);',
    ),
  ],
});
