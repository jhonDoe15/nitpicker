import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule as boundedContainerTeardown } from '../../rules/testing/lifecycle/bounded-container-teardown.mjs';
import { rule as containerPause } from '../../rules/testing/lifecycle/container-pause-requires-finally-unpause.mjs';
import { rule as hermeticGit } from '../../rules/testing/processes/hermetic-git-in-tests.mjs';
import { rule as processTimeout } from '../../rules/testing/processes/timeouts/require-test-process-timeout.mjs';
import { rule as noShellStringCommand } from '../../rules/guards/no-shell-string-command.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/tests/integration/cleanup.test.ts';
const HOLE = ['$', '{dir}'].join('');
const lines = (...parts) => parts.join('\n');
const teardownImport = "import { teardownContainer } from './containers';";
const unbounded = [{ messageId: 'unboundedStop' }];

tester.run('bounded-container-teardown fixes', boundedContainerTeardown, {
  valid: [],
  invalid: [
    {
      filename,
      code: lines(teardownImport, 'afterAll(async () => { await container.stop(); });'),
      errors: unbounded,
      output: lines(
        teardownImport,
        'afterAll(async () => { await teardownContainer(container); });',
      ),
    },
    {
      filename,
      code: lines(teardownImport, 'afterEach(() => fixture.databaseContainer.stop());'),
      errors: unbounded,
      output: lines(
        teardownImport,
        'afterEach(() => teardownContainer(fixture.databaseContainer));',
      ),
    },
    {
      filename,
      code: 'afterAll(async () => { await container.stop(); });',
      errors: unbounded,
      output: null,
    },
    {
      filename,
      code: lines(
        teardownImport,
        'afterAll(async () => { await container.stop({ timeout: 0 }); });',
      ),
      errors: unbounded,
      output: null,
    },
    {
      filename,
      code: lines(teardownImport, 'afterAll(async () => { await container?.stop(); });'),
      errors: unbounded,
      output: null,
    },
  ],
});

const pausedImport = "import { withPausedContainer } from './containers';";
const unguarded = [{ messageId: 'unguardedPause' }];
const pausedFile = '/repo/tests/integration/paused.test.ts';

tester.run('container-pause-requires-finally-unpause fixes', containerPause, {
  valid: [],
  invalid: [
    {
      filename: pausedFile,
      code: lines(
        pausedImport,
        'it("pauses", async () => {',
        '  await container.pause();',
        '  await probe();',
        '  expect(await status()).toBe(1);',
        '  await container.unpause();',
        '});',
      ),
      errors: unguarded,
      output: lines(
        pausedImport,
        'it("pauses", async () => {',
        '  await withPausedContainer(container, async () => {',
        '  await probe();',
        '  expect(await status()).toBe(1);',
        '});',
        '});',
      ),
    },
    {
      filename: pausedFile,
      code: 'await container.pause();\nawait probe();',
      errors: unguarded,
      output: null,
    },
    {
      filename: pausedFile,
      code: lines(pausedImport, 'await container.pause();', 'await container.unpause();'),
      errors: unguarded,
      output: null,
    },
    {
      filename: pausedFile,
      code: lines(
        pausedImport,
        'async function run() {',
        '  await container.pause();',
        '  if (ready) { return; }',
        '  await container.unpause();',
        '}',
      ),
      errors: unguarded,
      output: null,
    },
    {
      filename: pausedFile,
      code: lines(
        pausedImport,
        'await container.pause();',
        'const status = await probe();',
        'await container.unpause();',
      ),
      errors: unguarded,
      output: null,
    },
    {
      filename: pausedFile,
      code: lines(
        pausedImport,
        'await container.pause();',
        'await probe(); /* keep */',
        'await container.unpause();',
      ),
      errors: unguarded,
      output: null,
    },
    {
      filename: pausedFile,
      code: lines(
        pausedImport,
        'container.pause();',
        'await probe();',
        'await container.unpause();',
      ),
      errors: unguarded,
      output: null,
    },
  ],
});

const childProcess = "import { execFileSync, execSync, spawnSync } from 'node:child_process';";
const nonHermetic = [{ messageId: 'nonHermeticGit' }];
const gitFile = '/repo/tests/integration/repository.test.ts';
const hermetic = "GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'";

tester.run('hermetic-git-in-tests fixes', hermeticGit, {
  valid: [],
  invalid: [
    {
      filename: gitFile,
      code: lines(
        childProcess,
        "execFileSync('git', ['status'], { cwd: root, env: { PATH: '/bin' } });",
      ),
      errors: nonHermetic,
      output: lines(
        childProcess,
        `execFileSync('git', ['status'], { cwd: root, env: { PATH: '/bin', ${hermetic} } });`,
      ),
    },
    {
      filename: gitFile,
      code: lines(
        childProcess,
        "execFileSync('git', ['status'], { env: { GIT_CONFIG_GLOBAL: '/dev/null' } });",
      ),
      errors: nonHermetic,
      output: lines(
        childProcess,
        "execFileSync('git', ['status'], { env: { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });",
      ),
    },
    {
      filename: gitFile,
      code: lines(childProcess, "execFileSync('git', ['status'], { cwd: root });"),
      errors: nonHermetic,
      output: lines(
        childProcess,
        `execFileSync('git', ['status'], { cwd: root, env: { ...process.env, ${hermetic} } });`,
      ),
    },
    {
      filename: gitFile,
      code: lines(childProcess, "execSync('git status', { env: { ...process.env } });"),
      errors: nonHermetic,
      output: lines(
        childProcess,
        `execSync('git status', { env: { ...process.env, ${hermetic} } });`,
      ),
    },
    {
      filename: gitFile,
      code: lines(childProcess, "execFileSync('git', ['status']);"),
      errors: nonHermetic,
      output: null,
    },
    {
      filename: gitFile,
      code: lines(childProcess, "execFileSync('git', ['status'], { env: process.env });"),
      errors: nonHermetic,
      output: null,
    },
    {
      filename: gitFile,
      code: lines(childProcess, "execFileSync('git', ['status'], options);"),
      errors: nonHermetic,
      output: null,
    },
    {
      filename: gitFile,
      code: lines(childProcess, "execFileSync('git', ['status'], { ...base });"),
      errors: nonHermetic,
      output: null,
    },
    {
      filename: gitFile,
      code: lines(childProcess, "execFileSync('git', ['status'], { env: { [key]: '1' } });"),
      errors: nonHermetic,
      output: null,
    },
  ],
});

const spawn = "import { spawnSync } from 'node:child_process';";
const added = (method, output) => [
  {
    messageId: 'missingTimeout',
    data: { method },
    suggestions: [{ messageId: 'addTimeout', output }],
  },
];
const missing = (method) => [{ messageId: 'missingTimeout', data: { method } }];

tester.run('require-test-process-timeout suggestions', processTimeout, {
  valid: [],
  invalid: [
    {
      code: `${spawn} spawnSync('tool');`,
      errors: added('spawnSync', `${spawn} spawnSync('tool', [], { timeout: 10000 });`),
    },
    {
      code: `${spawn} spawnSync('tool', ['a']);`,
      errors: added('spawnSync', `${spawn} spawnSync('tool', ['a'], { timeout: 10000 });`),
    },
    {
      code: `${spawn} spawnSync('tool', ['a'], { cwd });`,
      errors: added('spawnSync', `${spawn} spawnSync('tool', ['a'], { cwd, timeout: 10000 });`),
    },
    {
      code: "import { execSync } from 'node:child_process'; execSync('tool');",
      errors: added(
        'execSync',
        "import { execSync } from 'node:child_process'; execSync('tool', { timeout: 10000 });",
      ),
    },
    {
      code: "import { execSync } from 'node:child_process'; execSync('tool', { encoding: 'utf8' });",
      errors: added(
        'execSync',
        "import { execSync } from 'node:child_process'; execSync('tool', { encoding: 'utf8', timeout: 10000 });",
      ),
    },
    {
      code: `${spawn} spawnSync('tool', [], { timeout: 0 });`,
      errors: missing('spawnSync'),
    },
  ],
});

const shell = [{ messageId: 'shellString' }];
const suggested = (messageId, output) => [
  { messageId: 'shellString', suggestions: [{ messageId, output }] },
];
const imports =
  "import { exec, execFile, execSync, execFileSync, spawn } from 'node:child_process';";

tester.run('no-shell-string-command suggestions', noShellStringCommand, {
  valid: [],
  invalid: [
    {
      code: `${imports} exec(\`git log \${ref}\`);`,
      errors: suggested('useExecFile', `${imports} execFile('git', ['log', String(ref)]);`),
    },
    {
      code: `${imports} exec(\`git log --format=\${format} -n 3\`, { cwd }, () => undefined);`,
      errors: suggested(
        'useExecFile',
        `${imports} execFile('git', ['log', \`--format=\${format}\`, '-n', '3'], { cwd }, () => undefined);`,
      ),
    },
    {
      code: `${imports} execSync(\`ls \${dir}\`);`,
      errors: suggested('useExecFile', `${imports} execFileSync('ls', [String(dir)]);`),
    },
    {
      code: `import * as cp from 'node:child_process'; cp.exec(\`ls ${HOLE}\`);`,
      errors: suggested(
        'useExecFile',
        "import * as cp from 'node:child_process'; cp.execFile('ls', [String(dir)]);",
      ),
    },
    {
      code: `${imports} exec(\`ls \${dir} | wc -l\`);`,
      errors: shell,
    },
    {
      code: `${imports} exec(\`\${program} --version\`);`,
      errors: shell,
    },
    {
      code: `${imports} exec(\`ls \${dir}\`, { shell: '/bin/bash' });`,
      errors: shell,
    },
    {
      code: `import { exec } from 'node:child_process'; exec(\`ls ${HOLE}\`);`,
      errors: shell,
    },
    {
      code: `${imports} exec(command);`,
      errors: shell,
    },
    {
      code: `${imports} spawn('git', ['status', ref], { shell: true });`,
      errors: suggested('dropShell', `${imports} spawn('git', ['status', ref], {});`),
    },
    {
      code: `${imports} spawn('git status', { cwd, shell: true });`,
      errors: suggested('dropShell', `${imports} spawn('git', ['status'], { cwd });`),
    },
    {
      code: `${imports} spawn('git status | cat', { shell: true });`,
      errors: shell,
    },
    {
      code: `${imports} spawn(command, ['status'], { shell: true });`,
      errors: shell,
    },
    {
      code: `${imports} spawn('NODE_ENV=test node app.js', { shell: true });`,
      errors: shell,
    },
    {
      code: `${imports} spawn('git', [...args], { shell: true });`,
      errors: shell,
    },
  ],
});
