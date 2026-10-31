import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { commit, fixtureGit, useGitFixtures } from '../../../git/test-support/git-repository.mjs';
import { writeFiles } from '../../../git/test-support/fixture-files.mjs';
import { executeStep } from './test-support/action-steps.mjs';
import { CI_TARGET_VARIABLES } from '../../../git/repository/base-ref.mjs';
import { LISTED_FINDINGS, LISTED_TOOL_ERRORS } from '../markdown.mjs';
import { MAX_ANNOTATIONS, MAX_TOOL_ERROR_ANNOTATIONS } from '../workflow-commands.mjs';
import {
  ACTION_BLOCK_END,
  ACTION_BLOCK_START,
  renderActionReference,
} from '../../../../../scripts/action-inputs.mjs';

const repositoryRoot = path.join(import.meta.dirname, '../../../../..');

function readText(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

const actionText = readText('action.yml');
const action = parse(actionText);
const steps = action.runs.steps;
const workflow = parse(readText('.github/workflows/github-action.yml'));
const docs = readText('docs/ci.md');
const usage = readText('docs/usage.md');
const { version } = JSON.parse(readText('package.json'));

function floatingTag(release) {
  const [major, minor] = release.split(/[.-]/u);
  return major === '0' ? `v0.${minor}` : `v${major}`;
}

const FULL_VERSION_TAG = /^[\w.-]+\/[\w./-]+@v\d+\.\d+\.\d+$/u;

function stepNamed(prefix) {
  return steps.find((step) => step.name?.startsWith(prefix));
}

function scriptLines(step, fragment) {
  return step.run.split('\n').filter((line) => line.includes(fragment));
}

describe('action.yml', () => {
  it('is a composite action', () => {
    expect(action.runs.using).toBe('composite');
  });

  it('declares every input it reads, each with a default and a description', () => {
    const read = [...actionText.matchAll(/inputs\.([a-z-]+)/gu)].map(([, name]) => name);
    const inputs = Object.values(action.inputs);

    expect(new Set(read)).toEqual(new Set(Object.keys(action.inputs)));
    expect(inputs.map((input) => typeof input.default)).toEqual(inputs.map(() => 'string'));
    expect(inputs.map((input) => typeof input.description)).toEqual(inputs.map(() => 'string'));
  });

  it('never puts an input or event value into a script', () => {
    const scripts = steps.flatMap((step) => (step.run === undefined ? [] : [step.run]));

    expect(scripts.filter((script) => script.includes('${{'))).toEqual([]);
  });

  it('pins every action to a full version tag', () => {
    const used = steps.flatMap((step) => (step.uses === undefined ? [] : [step.uses]));

    expect(used.filter((reference) => !FULL_VERSION_TAG.test(reference))).toEqual([]);
  });

  it('exposes outputs that name a step which exists', () => {
    const ids = steps.flatMap((step) => (step.id === undefined ? [] : [step.id]));
    const named = Object.values(action.outputs).map(
      (output) => /steps\.([\w-]+)\.outputs\./u.exec(output.value)?.[1],
    );

    expect(named.filter((id) => !ids.includes(id))).toEqual([]);
  });

  it('keeps the policy acceptance behind an input and never sets a digest', () => {
    const gate = stepNamed('Run the gate');

    expect(gate.env.NITPICKER_ACCEPT_POLICY_CHANGE).toBe('${{ inputs.accept-policy-change }}');
    expect(action.inputs['accept-policy-change'].default).toBe('');
  });

  it('runs the project own nitpicker from the working directory', () => {
    const gate = stepNamed('Run the gate');

    expect(gate['working-directory']).toBe('${{ inputs.working-directory }}');
    expect(scriptLines(gate, 'runner=(npx')).toEqual([
      '  runner=(npx --yes --package "$PACKAGE" nitpicker)',
      '  runner=(npx --no-install nitpicker)',
    ]);
  });

  it('publishes only where the comparison is skipped, on the default branch', () => {
    const publish = stepNamed('Publish');

    expect(publish.if).toBe(
      "${{ steps.prepare.outputs.skip-gate == 'true' && inputs.cache-publish == 'true' }}",
    );
    expect(scriptLines(publish, 'cache publish')).toEqual([
      '  npx --yes --package "$PACKAGE" nitpicker cache publish',
      '  npx --no-install nitpicker cache publish',
    ]);
  });
});

describe('the sample workflow', () => {
  const job = workflow.jobs['sample-project'];

  it('follows the triggers of the other workflows and is not a pull request check', () => {
    expect([
      workflow.on.push.branches,
      workflow.on.pull_request.types,
      workflow.on.workflow_dispatch,
      workflow.permissions,
    ]).toEqual([['main'], ['labeled'], null, { contents: 'read' }]);
    expect(job.if).toBe(
      "github.event_name != 'pull_request' || github.event.label.name == 'run-ci'",
    );
    expect([job['timeout-minutes'], job.strategy.matrix.os, job.defaults.run.shell]).toEqual([
      30,
      ['ubuntu-latest', 'windows-latest'],
      'bash',
    ]);
  });

  it('uses the action of this repository on the sample project', () => {
    const use = job.steps.find((step) => step.uses === './');

    expect(use['continue-on-error']).toBe(true);
    expect(use.with['working-directory']).toBe('.github/sample-project');
  });

  it('runs the action on a Python project without a package.json, from a packed tarball', () => {
    const use = workflow.jobs['sample-python'].steps.find((step) => step.uses === './');

    expect([use.with['install-command'], use.with.package]).toEqual([
      'none',
      '${{ steps.pack.outputs.tarball }}',
    ]);
  });

  it('exercises the inputs a project sets most, across its jobs', () => {
    const given = Object.values(workflow.jobs).flatMap((each) =>
      each.steps.filter((step) => step.uses === './').flatMap((step) => Object.keys(step.with)),
    );

    expect([...new Set(given)].sort()).toEqual([
      'arguments',
      'artifact-name',
      'base-ref',
      'install-command',
      'package',
      'report-directory',
      'working-directory',
    ]);
  });

  it('pins the actions it uses to full version tags', () => {
    const used = Object.values(workflow.jobs)
      .flatMap((each) => each.steps)
      .flatMap((step) => (step.uses === undefined ? [] : [step.uses]));

    expect(
      used.filter((reference) => reference !== './' && !FULL_VERSION_TAG.test(reference)),
    ).toEqual([]);
  });
});

describe('docs/ci.md', () => {
  it('documents every input and output of the action', () => {
    const names = [...Object.keys(action.inputs), ...Object.keys(action.outputs)];

    expect(names.filter((name) => !docs.includes(`\`${name}\``))).toEqual([]);
  });

  it('names every CI variable that picks the base', () => {
    expect(CI_TARGET_VARIABLES.filter((variable) => !docs.includes(variable))).toEqual([]);
  });

  it('pins the actions in its examples to full version tags, and the action to its floating tag', () => {
    const references = [...docs.matchAll(/uses: ([\w.-]+\/[\w./-]+)@(\S+)/gu)];
    const others = references.filter(([, name]) => name !== 'jhonDoe15/nitpicker');
    const own = references.filter(([, name]) => name === 'jhonDoe15/nitpicker');

    expect(others.filter(([, , version]) => !/^v\d+\.\d+\.\d+$/u.test(version))).toEqual([]);
    expect(new Set(own.map(([, , tag]) => tag))).toEqual(new Set([floatingTag(version)]));
    const tag = floatingTag(version);
    expect(docs.split('\n').find((line) => line.startsWith(`\`${tag}\` is`))).toBe(
      `\`${tag}\` is a floating tag that moves to each stable ${tag.slice(1)}.x release (see`,
    );
  });

  it('states the limits of the job summary and the annotations as the code sets them', () => {
    expect(
      [
        `the first ${String(LISTED_FINDINGS)} new enforceable findings`,
        `the first ${String(LISTED_TOOL_ERRORS)} tool errors`,
        `at most ${String(MAX_ANNOTATIONS)} error`,
        `writes at most ${String(MAX_ANNOTATIONS)} (tool errors take up to ${String(MAX_TOOL_ERROR_ANNOTATIONS)} of them)`,
      ].filter((text) => !docs.replaceAll(/\s+/gu, ' ').includes(text)),
    ).toEqual([]);
  });

  it('lists the inputs and outputs of action.yml in wrapped lines between the markers', () => {
    const reference = renderActionReference(action);

    const start = docs.indexOf(ACTION_BLOCK_START) + ACTION_BLOCK_START.length;

    expect(docs.slice(start, docs.indexOf(ACTION_BLOCK_END))).toBe(`\n\n${reference}\n\n`);
    expect(reference.split('\n').filter((line) => line.length > 100)).toEqual([]);
  });
});

describe('floatingTag', () => {
  it.each([
    ['0.1.0', 'v0.1'],
    ['0.12.3-rc.1', 'v0.12'],
    ['1.4.0', 'v1'],
  ])('names %s as %s', (release, tag) => {
    expect(floatingTag(release)).toBe(tag);
  });
});

describe('docs/usage.md', () => {
  it('names every CI variable that picks the base', () => {
    expect(CI_TARGET_VARIABLES.filter((variable) => !usage.includes(`\`${variable}\``))).toEqual(
      [],
    );
  });
});

const releaseWorkflow = parse(
  readFileSync(path.join(repositoryRoot, '.github/workflows/github-release.yml'), 'utf8'),
);

const releaseStep = releaseWorkflow.jobs.release.steps.find(
  ({ name }) => name === 'Move the floating tag',
);

const { createGitRepository, temporaryRoot } = useGitFixtures();

function releaseClone() {
  const remote = temporaryRoot('nitpicker-release-remote-');
  fixtureGit(remote, ['init', '-q', '--bare']);
  const clone = createGitRepository({ 'a.txt': 'a\n' }).root;
  fixtureGit(clone, ['remote', 'add', 'origin', remote]);
  return { remote, clone };
}

function release(clone, tag) {
  writeFiles(clone, { 'release.txt': `${tag}\n` });
  commit(clone, tag);
  const sha = fixtureGit(clone, ['rev-parse', 'HEAD']).trim();
  const result = executeStep({
    step: releaseStep,
    root: temporaryRoot('nitpicker-release-runner-'),
    cwd: clone,
    environment: { TAG: tag, COMMIT: sha },
    searchPath: process.env.PATH,
  });
  return { ...result, sha };
}

function remoteTags(remote) {
  return fixtureGit(remote, ['tag', '--list', '--format=%(refname:short) %(objectname)'])
    .split('\n')
    .filter(Boolean);
}

describe('the floating release tag', () => {
  it('runs for stable releases only', () => {
    expect(releaseStep.if).toBe('${{ !inputs.prerelease }}');
  });

  it('moves v0.<minor> before 1.0 and v<major> from 1.0', () => {
    const { remote, clone } = releaseClone();
    const first = release(clone, 'v0.1.0');
    const patch = release(clone, 'v0.1.1');
    const major = release(clone, 'v1.2.0');

    expect([first.status, patch.status, major.status]).toEqual([0, 0, 0]);
    expect(remoteTags(remote)).toEqual([`v0.1 ${patch.sha}`, `v1 ${major.sha}`]);
  });

  it('leaves the tags alone for a version with a pre-release suffix', () => {
    const { remote, clone } = releaseClone();
    const { status, stdout } = release(clone, 'v0.2.0-rc.1');

    expect([status, stdout, remoteTags(remote)]).toEqual([
      0,
      '::notice::v0.2.0-rc.1 has a pre-release suffix; no floating tag moves.\n',
      [],
    ]);
  });

  it('refuses to move a tag back to a commit that does not contain it', () => {
    const { remote, clone } = releaseClone();
    const later = release(clone, 'v0.3.1');
    fixtureGit(clone, ['checkout', '-q', '-b', 'old', 'HEAD~1']);
    const { status, stdout } = release(clone, 'v0.3.0');

    expect([status, stdout, remoteTags(remote)]).toEqual([
      1,
      '::error::v0.3 points at a commit that v0.3.0 does not contain; move it by hand if that is intended.\n',
      [`v0.3 ${later.sha}`],
    ]);
  });
});
