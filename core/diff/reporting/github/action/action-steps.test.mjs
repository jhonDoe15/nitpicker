import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { commit, fixtureGit, useGitFixtures } from '../../../git/test-support/git-repository.mjs';
import { writeFiles } from '../../../git/test-support/fixture-files.mjs';
import { resolveBase } from '../../../git/repository/base-ref.mjs';
import { actionStep, executeStep, readAction, windowsTools } from './test-support/action-steps.mjs';

function runAt({ name, root, cwd, environment }) {
  return executeStep({
    step: actionStep(name),
    root,
    cwd,
    environment,
    searchPath: environment.PATH ?? process.env.PATH,
  });
}

const { createGitRepository, temporaryRoot } = useGitFixtures();

const INSTALL = "Install the project's dependencies";
const PUBLISH = 'Publish the findings of the default branch';
const FAIL = 'Fail when the gate failed';

function remoteWith(branches) {
  const remote = createGitRepository({ 'package.json': '{}\n' }).root;
  for (const branch of branches) {
    fixtureGit(remote, ['branch', branch]);
  }
  fixtureGit(remote, ['checkout', '-q', '-b', 'feature']);
  writeFiles(remote, { 'feature.txt': 'feature\n' });
  commit(remote, 'feature');
  const forkPoint = fixtureGit(remote, ['rev-parse', 'feature~1']).trim();
  fixtureGit(remote, ['checkout', '-q', 'main']);
  writeFiles(remote, { 'main.txt': 'main\n' });
  commit(remote, 'main moves on');
  return { remote, forkPoint };
}

function shallowCheckout(remote, branch) {
  const checkout = temporaryRoot('nitpicker-action-checkout-');
  const sha = fixtureGit(remote, ['rev-parse', branch]).trim();
  fixtureGit(checkout, ['init', '-q']);
  fixtureGit(checkout, ['remote', 'add', 'origin', `file://${remote}`]);
  fixtureGit(checkout, [
    'fetch',
    '-q',
    '--depth=1',
    'origin',
    `+${sha}:refs/remotes/origin/${branch}`,
  ]);
  fixtureGit(checkout, ['checkout', '-q', '--detach', sha]);
  return checkout;
}

function prepare(checkout, environment) {
  return runAt({
    name: 'prepare',
    root: temporaryRoot('nitpicker-action-runner-'),
    cwd: checkout,
    environment: {
      BASE_REF: '',
      PACKAGE: '',
      WORKING_DIRECTORY: '.',
      DEFAULT_BRANCH: 'main',
      MERGE_GROUP_BASE_REF: '',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_REF: 'refs/pull/1/merge',
      ...environment,
    },
  });
}

function gate(environment) {
  const root = temporaryRoot('nitpicker-action-runner-');
  const result = runAt({
    name: 'gate',
    root,
    cwd: root,
    environment: {
      BASE: 'origin/main',
      EXTRA_ARGUMENTS: '',
      PACKAGE: '',
      REPORT_DIRECTORY: 'reports/quality/diff',
      CACHE_ENABLED: 'true',
      ...environment,
    },
  });
  return { ...result, root };
}

describe('every run step of action.yml', () => {
  it('is covered here, so a new step gets a test', () => {
    const runSteps = readAction().runs.steps.filter((step) => step.run !== undefined);

    expect(runSteps.map((step) => step.id ?? step.name)).toEqual([
      INSTALL,
      'prepare',
      'gate',
      PUBLISH,
      FAIL,
    ]);
    expect(runSteps.map((step) => step.shell)).toEqual(runSteps.map(() => 'bash'));
  });
});

describe('the install step', () => {
  function install(files, installCommand = '', environment = {}) {
    const root = temporaryRoot('nitpicker-action-install-');
    writeFiles(root, files);
    const project = path.join(root, 'app');
    mkdirSync(project, { recursive: true });
    const result = runAt({
      name: INSTALL,
      root,
      cwd: project,
      environment: { INSTALL_COMMAND: installCommand, ...environment },
    });
    return { ...result, root };
  }

  it('runs npm ci in the folder of the nearest lockfile', () => {
    const { status, commands, root } = install({ 'package-lock.json': '{}\n' });

    expect([status, commands]).toEqual([0, [`npm ci (in ${root})`]]);
  });

  it.each([
    ['pnpm-lock.yaml', 'pnpm install --frozen-lockfile'],
    ['yarn.lock', 'yarn install --immutable'],
  ])('installs from %s with a frozen lockfile', (lockfile, expected) => {
    const { status, commands, root } = install({ [lockfile]: '\n' });

    expect([status, commands.at(-1)]).toEqual([0, `${expected} (in ${root})`]);
  });

  it('fails with an annotation for a Bun project without bun', () => {
    const { status, stdout } = install({ 'bun.lock': '\n' }, '', { PATH: '/usr/bin:/bin' });

    expect([status, stdout.split('\n')[0]]).toEqual([
      1,
      '::error title=nitpicker::The project uses Bun but bun is not installed. Add oven-sh/setup-bun before this step, or set install-command.',
    ]);
  });

  it('stops a custom command of several lines at the first line that fails', () => {
    const { status, commands } = install({}, 'false\nnpm ci');

    expect([status, commands]).toEqual([1, []]);
  });

  it('stops looking for a lockfile at the workspace on Windows, where paths differ', () => {
    const outer = temporaryRoot('nitpicker-action-outer-');
    writeFiles(outer, { 'package-lock.json': '{}\n' });
    const project = path.join(outer, 'repo/app');
    mkdirSync(project, { recursive: true });
    const result = runAt({
      name: INSTALL,
      root: outer,
      cwd: project,
      environment: {
        INSTALL_COMMAND: '',
        GITHUB_WORKSPACE: String.raw`D:\a\repo`,
        FAKE_UNIX_WORKSPACE: path.join(outer, 'repo'),
        PATH: `${windowsTools(outer)}:${process.env.PATH}`,
      },
    });

    expect([result.status, result.commands]).toEqual([0, []]);
  });

  it('installs nothing for none, and runs a custom command in the working directory', () => {
    const none = install({ 'package-lock.json': '{}\n' }, 'none');
    const custom = install({}, 'npm install --no-save "$GITHUB_WORKSPACE"');

    expect([none.status, none.commands, custom.status, custom.commands]).toEqual([
      0,
      [],
      0,
      [`npm install --no-save ${custom.root} (in ${custom.root}/app)`],
    ]);
  });
});

describe('the prepare step', () => {
  it('fetches the pull request target into a shallow checkout and keys the cache on the merge base', () => {
    const { remote, forkPoint } = remoteWith([]);
    const checkout = shallowCheckout(remote, 'feature');
    const { status, outputs } = prepare(checkout, {
      GITHUB_BASE_REF: 'main',
      WORKING_DIRECTORY: 'apps/web,v2',
    });

    expect([status, outputs]).toEqual([
      0,
      {
        'skip-gate': 'false',
        'cache-scope': 'apps%2Fweb%2Cv2',
        'cache-dir': `${checkout}/.git/nitpicker-cache`,
        base: 'origin/main',
        'base-sha': forkPoint,
      },
    ]);
  });

  it('compares a push to a feature branch with the default branch, whatever it is called', () => {
    const { remote, forkPoint } = remoteWith(['develop']);
    fixtureGit(remote, ['branch', '-f', 'develop', 'main']);
    const checkout = shallowCheckout(remote, 'feature');
    const { status, outputs } = prepare(checkout, {
      DEFAULT_BRANCH: 'develop',
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/heads/feature',
    });

    expect([status, outputs.base, outputs['base-sha']]).toEqual([0, 'origin/develop', forkPoint]);
    expect(resolveBase({ repositoryRoot: checkout, environment: {} }).baseRef).toBe(outputs.base);
  });

  it('honours base in nitpicker.config.json and fetches it', () => {
    const { remote, forkPoint } = remoteWith(['release']);
    fixtureGit(remote, ['checkout', '-q', 'feature']);
    writeFiles(remote, { 'nitpicker.config.json': '{ "base": "origin/release" }\n' });
    commit(remote, 'configure the base');
    const checkout = shallowCheckout(remote, 'feature');
    const { status, outputs } = prepare(checkout, {
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/feature',
    });

    expect([status, outputs.base, outputs['base-sha']]).toEqual([0, 'origin/release', forkPoint]);
  });

  it('takes the merge group target and lets base-ref win over everything', () => {
    const { remote, forkPoint } = remoteWith(['release']);
    const mergeGroup = prepare(shallowCheckout(remote, 'feature'), {
      GITHUB_EVENT_NAME: 'merge_group',
      MERGE_GROUP_BASE_REF: 'refs/heads/release',
    });
    const explicit = prepare(shallowCheckout(remote, 'feature'), {
      BASE_REF: 'origin/release',
      GITHUB_BASE_REF: 'main',
    });

    expect([
      mergeGroup.outputs.base,
      mergeGroup.outputs['base-sha'],
      explicit.outputs.base,
    ]).toEqual(['origin/release', forkPoint, 'origin/release']);
  });

  it('skips the comparison on a push to the default branch', () => {
    const { remote } = remoteWith([]);
    const { status, outputs, commands } = prepare(shallowCheckout(remote, 'main'), {
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/heads/main',
    });

    expect([status, outputs['skip-gate'], outputs['base-sha'], commands]).toEqual([
      0,
      'true',
      'none',
      [],
    ]);
  });

  it('fails with an annotation when there is no merge base', () => {
    const { remote } = remoteWith([]);
    const checkout = shallowCheckout(remote, 'feature');
    fixtureGit(remote, ['checkout', '-q', '--orphan', 'unrelated']);
    commit(remote, 'unrelated history');
    const { status, stdout } = prepare(checkout, { BASE_REF: 'origin/unrelated' });

    expect([status, stdout.trim().split('\n').at(-1)]).toEqual([
      1,
      "::error title=nitpicker needs the merge base::There is no merge base between HEAD and origin/unrelated. Check out the full history with 'fetch-depth: 0' in actions/checkout (a shallow checkout cannot find where the branch started), and make sure origin/unrelated exists.",
    ]);
  });

  it('fails with an annotation when the project has no nitpicker', () => {
    const { remote } = remoteWith([]);
    const checkout = shallowCheckout(remote, 'feature');
    const { status, stdout } = prepare(checkout, { FAKE_HELP_EXIT: '1' });

    expect([status, stdout.split('\n')[0]]).toEqual([
      1,
      `::error title=nitpicker is not installed::nitpicker was not found in '${checkout}'. Add it as a devDependency (npm install --save-dev nitpicker) so the version matches your lockfile, or set the 'package' input (for example nitpicker@<version>) for a project without a package.json.`,
    ]);
  });
});

describe('the prepare step with a base that is not a branch, or an older nitpicker', () => {
  it('fetches a tag or a commit given as base-ref into a shallow checkout', () => {
    const { remote, forkPoint } = remoteWith([]);
    fixtureGit(remote, ['tag', 'v1', forkPoint]);
    const tag = prepare(shallowCheckout(remote, 'feature'), { BASE_REF: 'v1' });
    const sha = prepare(shallowCheckout(remote, 'feature'), { BASE_REF: forkPoint });

    expect([tag.status, tag.outputs['base-sha'], sha.status, sha.outputs['base-sha']]).toEqual([
      0,
      forkPoint,
      0,
      forkPoint,
    ]);
  });

  it('names a base-ref that origin does not have', () => {
    const { remote } = remoteWith([]);
    const { status, stdout } = prepare(shallowCheckout(remote, 'feature'), { BASE_REF: 'v9' });

    expect([status, stdout.trim().split('\n').at(-1)]).toEqual([
      1,
      '::error title=nitpicker cannot find the base::v9 is not in the checkout and could not be fetched from origin. Set base-ref to a branch (origin/<branch>), a tag or a commit SHA that origin has.',
    ]);
  });

  it('falls back to the pull request target when the nitpicker of the project has no base command', () => {
    const { remote, forkPoint } = remoteWith([]);
    const { status, stdout, outputs } = prepare(shallowCheckout(remote, 'feature'), {
      FAKE_NO_BASE: '1',
      GITHUB_BASE_REF: 'main',
    });

    expect([status, stdout.trim(), outputs.base, outputs['base-sha']]).toEqual([
      0,
      "::error title=nitpicker is too old for this action::The nitpicker of this project has no 'base' command, so the action cannot read base from nitpicker.config.json. Upgrade to nitpicker 0.1.0 or newer. This run compares with origin/main.",
      'origin/main',
      forkPoint,
    ]);
  });

  it('writes the cache folder as a Windows path where cygpath exists', () => {
    const { remote } = remoteWith([]);
    const checkout = shallowCheckout(remote, 'feature');
    const tools = windowsTools(temporaryRoot('nitpicker-action-tools-'));
    const { outputs } = prepare(checkout, {
      GITHUB_BASE_REF: 'main',
      PATH: `${tools}:${process.env.PATH}`,
    });

    expect(outputs['cache-dir']).toBe(`C:${checkout}/.git/nitpicker-cache`);
  });
});

describe('the gate step', () => {
  it('refuses --all, since the action always compares with a base', () => {
    const { status, stdout, outputs } = gate({ EXTRA_ARGUMENTS: '--all' });

    expect([status, stdout.trim(), outputs]).toEqual([
      1,
      '::error title=nitpicker arguments::The action runs a comparison with a base, which --all cannot be combined with. Run npx nitpicker --all in a step of its own for a full run.',
      {},
    ]);
  });

  it('writes the report folder as a Windows path where cygpath exists', () => {
    const tools = windowsTools(temporaryRoot('nitpicker-action-tools-'));
    const { outputs, root } = gate({ PATH: `${tools}:${process.env.PATH}` });

    expect(outputs['report-directory']).toBe(`C:${root}/reports/quality/diff`);
  });

  it('records the exit code of a failing gate instead of stopping the step', () => {
    const { status, outputs, commands, root } = gate({ FAKE_GATE_EXIT: '1' });

    expect([status, outputs, commands]).toEqual([
      0,
      { 'exit-code': '1', 'report-directory': `${root}/reports/quality/diff` },
      ['npx --no-install nitpicker --base origin/main --output reports/quality/diff'],
    ]);
  });

  it('passes one argument per word or line, and --no-cache when the cache is off', () => {
    const { outputs, commands } = gate({
      EXTRA_ARGUMENTS: '--analyzer eslint-lint\n--verbose',
      CACHE_ENABLED: 'false',
      PACKAGE: 'nitpicker@1.2.3',
      FAKE_GATE_EXIT: '2',
    });

    expect([outputs['exit-code'], commands]).toEqual([
      '2',
      [
        'npx --yes --package nitpicker@1.2.3 nitpicker --base origin/main --output reports/quality/diff --analyzer eslint-lint --verbose --no-cache',
      ],
    ]);
  });

  it.each(['--output', '--output=out', '--base', '--base=origin/x'])(
    'refuses %s in arguments',
    (argument) => {
      const { status, stdout, outputs } = gate({ EXTRA_ARGUMENTS: `--verbose ${argument}` });

      expect([status, stdout.trim(), outputs]).toEqual([
        1,
        `::error title=nitpicker arguments::Pass ${argument.split('=')[0]} through the report-directory or base-ref input, not through arguments.`,
        {},
      ]);
    },
  );
});

describe('the publish and fail steps', () => {
  function run(name, environment) {
    const root = temporaryRoot('nitpicker-action-runner-');
    return runAt({ name, root, cwd: root, environment });
  }

  it('publishes to the cache url, and only explains itself without one', () => {
    const published = run(PUBLISH, { PACKAGE: '', NITPICKER_CACHE_URL: 'https://cache.example/x' });
    const skipped = run(PUBLISH, { PACKAGE: '', NITPICKER_CACHE_URL: '' });
    const packaged = run(PUBLISH, {
      PACKAGE: '/tmp/nitpicker.tgz',
      NITPICKER_CACHE_URL: 'https://c.example',
    });

    expect([
      published.status,
      published.commands,
      skipped.status,
      skipped.stdout,
      skipped.commands,
      packaged.commands,
    ]).toEqual([
      0,
      ['npx --no-install nitpicker cache publish'],
      0,
      '::notice title=nitpicker::Nothing published: set the cache-url input to publish the findings of the default branch.\n',
      [],
      ['npx --yes --package /tmp/nitpicker.tgz nitpicker cache publish'],
    ]);
  });

  it('fails the job with the exit code of the gate', () => {
    const { status, stdout } = run(FAIL, { EXIT_CODE: '2' });

    expect([status, stdout]).toEqual([
      2,
      'nitpicker exited with code 2 (1: new enforceable findings, 2: a tool error or a failure to decide).\n',
    ]);
  });
});
