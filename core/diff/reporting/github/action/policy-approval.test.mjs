import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInThisContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { commit, fixtureGit, useGitFixtures } from '../../../git/test-support/git-repository.mjs';
import { writeFiles } from '../../../git/test-support/fixture-files.mjs';
import { APPROVAL_WORKFLOW, placeApprovalWorkflow } from '../../../../init/files/ci-workflow.mjs';
import { actionStep, executeStep, readAction } from './test-support/action-steps.mjs';

const repositoryRoot = path.join(import.meta.dirname, '../../../../..');
const TEMPLATE = 'core/init/templates/github-policy-approval.yml';

function readText(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

const { createGitRepository, temporaryRoot } = useGitFixtures();

function stepsById(steps) {
  return Object.fromEntries(steps.filter((step) => step.id).map((step) => [step.id, step]));
}

function bind(checkout, environment) {
  return executeStep({
    step: actionStep('approval'),
    root: temporaryRoot('nitpicker-action-runner-'),
    cwd: checkout,
    environment,
    searchPath: process.env.PATH,
  });
}

function pullRequestCheckout() {
  const { root } = createGitRepository({ 'package.json': '{}\n' });
  fixtureGit(root, ['checkout', '-q', '-b', 'feature']);
  writeFiles(root, { 'feature.txt': 'feature\n' });
  commit(root, 'feature');
  const head = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
  fixtureGit(root, ['checkout', '-q', 'main']);
  writeFiles(root, { 'main.txt': 'main\n' });
  commit(root, 'main moves on');
  fixtureGit(root, ['merge', '-q', '--no-ff', '-m', 'merge feature', 'feature']);
  const merge = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
  return { root, head, merge };
}

describe('the policy approval of action.yml', () => {
  const steps = stepsById(readAction().runs.steps);

  it('reads the approval only for a pull request head and binds it before the gate', () => {
    expect(steps['approval-status'].if).toBe(
      "${{ inputs.policy-approval == 'true' && steps.prepare.outputs.skip-gate != 'true' && github.event.pull_request.head.sha != '' }}",
    );
    expect(steps['approval-status'].env).toEqual({
      HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
      PULL_REQUEST: '${{ github.event.pull_request.number }}',
      TARGET_BRANCH: '${{ github.event.pull_request.base.ref }}',
    });
    expect(steps.approval.if).toBe("${{ steps.approval-status.outputs.approved-sha != '' }}");
  });

  it('runs the same two steps as the self-gate of this repository', () => {
    const workflow = parse(readText('.github/workflows/typescript.yml'));
    const own = stepsById(workflow.jobs['self-gate'].steps);

    expect(own['approval-status'].with.script).toBe(steps['approval-status'].with.script);
    expect(own.approval.run).toBe(steps.approval.run);
    expect(workflow.jobs['self-gate'].permissions).toEqual({
      contents: 'read',
      statuses: 'read',
    });
  });

  it('accepts the commit of a checkout of the approved head', () => {
    const { root, head } = pullRequestCheckout();
    fixtureGit(root, ['checkout', '-q', '--detach', head]);

    const { status, outputs } = bind(root, { APPROVED_SHA: head, GITHUB_SHA: 'unrelated' });

    expect([status, outputs]).toEqual([0, { acceptance: `commit:${head}` }]);
  });

  it('accepts the merge commit of the event when it merges the approved head', () => {
    const { root, head, merge } = pullRequestCheckout();

    const { status, outputs } = bind(root, { APPROVED_SHA: head, GITHUB_SHA: merge });

    expect([status, outputs]).toEqual([0, { acceptance: `commit:${merge}` }]);
  });

  it('accepts nothing and warns for a checkout of anything else', () => {
    const { root, head, merge } = pullRequestCheckout();
    fixtureGit(root, ['checkout', '-q', '--detach', 'main~1']);
    const checkout = fixtureGit(root, ['rev-parse', 'HEAD']).trim();

    const elsewhere = bind(root, { APPROVED_SHA: head, GITHUB_SHA: merge });
    fixtureGit(root, ['checkout', '-q', '--detach', merge]);
    const otherEvent = bind(root, { APPROVED_SHA: head, GITHUB_SHA: 'unrelated' });

    expect([elsewhere.status, elsewhere.outputs, elsewhere.stdout.trim()]).toEqual([
      0,
      {},
      `::warning title=nitpicker::The policy approval is for ${head}, but the checkout is ${checkout}, so it accepts nothing in this run.`,
    ]);
    expect([otherEvent.status, otherEvent.outputs]).toEqual([0, {}]);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function runScript(script, { github, payload = {}, environment = {} }) {
  const calls = { outputs: {}, failed: [], warnings: [], info: [], notices: [] };
  const core = {
    setOutput: (name, value) => (calls.outputs[name] = value),
    setFailed: (message) => calls.failed.push(message),
    warning: (message) => calls.warnings.push(message),
    info: (message) => calls.info.push(message),
    notice: (message) => calls.notices.push(message),
  };
  for (const [name, value] of Object.entries(environment)) {
    vi.stubEnv(name, value);
  }
  const context = { repo: { owner: 'owner', repo: 'repo' }, payload };
  const run = runInThisContext(`(async (github, context, core) => {\n${script}\n})`);
  await run(github, context, core);
  return calls;
}

function answering(result) {
  return result instanceof Error
    ? vi.fn().mockRejectedValue(result)
    : vi.fn().mockResolvedValue(result);
}

function fakeGithub({ permission, runs = [], statuses = [] }) {
  const rest = {
    issues: { removeLabel: answering({ data: {} }) },
    repos: {
      getCollaboratorPermissionLevel: answering(
        permission === undefined ? new Error('Not Found') : { data: { permission } },
      ),
      createCommitStatus: answering({ data: {} }),
      listCommitStatusesForRef: answering(statuses),
    },
    actions: {
      listWorkflowRunsForRepo: answering(runs),
      reRunWorkflowFailedJobs: answering({ data: {} }),
    },
  };
  return { paginate: (method, parameters) => method(parameters), rest };
}

function callLog(github) {
  const methods = Object.entries(github.rest).flatMap(([, group]) => Object.entries(group));
  return methods
    .flatMap(([name, method]) =>
      method.mock.calls.map((call, index) => ({
        order: method.mock.invocationCallOrder[index],
        entry: [name, call[0]],
      })),
    )
    .toSorted((left, right) => left.order - right.order)
    .map(({ entry }) => entry);
}

const HEAD = 'c'.repeat(40);
const LABELED = {
  pull_request: { number: 7, head: { sha: HEAD }, base: { ref: 'main' } },
  sender: { login: 'reviewer' },
  label: { name: 'accept-policy-change' },
};
const REPO = { owner: 'owner', repo: 'repo' };

describe('the policy approval workflow', () => {
  const template = readText(TEMPLATE);
  const workflow = parse(template);
  const job = workflow.jobs.approve;
  const approve = (github) => runScript(job.steps[0].with.script, { github, payload: LABELED });

  it('is what init writes and what this repository runs', () => {
    const repository = temporaryRoot('nitpicker-approval-');

    expect(placeApprovalWorkflow(repository)).toEqual({
      relative: APPROVAL_WORKFLOW,
      status: 'created',
    });
    expect([readText(APPROVAL_WORKFLOW), readText(TEMPLATE)]).toEqual([
      readFileSync(path.join(repository, APPROVAL_WORKFLOW), 'utf8'),
      readFileSync(path.join(repository, APPROVAL_WORKFLOW), 'utf8'),
    ]);
  });

  it('runs only for the label, from the base branch, without checking out the pull request', () => {
    expect([workflow.on, workflow.permissions, job.if]).toEqual([
      { pull_request_target: { types: ['labeled'] } },
      {},
      "github.event.label.name == 'accept-policy-change'",
    ]);
    expect(job.permissions).toEqual({
      actions: 'write',
      'pull-requests': 'write',
      statuses: 'write',
    });
    expect(job.steps.map((step) => step.uses)).toEqual(['actions/github-script@v8.0.0']);
    expect(template.includes('${{')).toBe(false);
  });

  it('records the approval of a person with write access and re-runs the failed runs, oldest first', async () => {
    const runs = [
      { id: 3, workflow_id: 1, name: 'typescript', status: 'completed', conclusion: 'skipped' },
      { id: 2, workflow_id: 1, name: 'typescript', status: 'completed', conclusion: 'failure' },
      { id: 1, workflow_id: 1, name: 'typescript', status: 'completed', conclusion: 'failure' },
      { id: 5, workflow_id: 2, name: 'docs', status: 'completed', conclusion: 'success' },
    ];
    const github = fakeGithub({ permission: 'write', runs });

    const calls = await approve(github);

    expect([calls.failed, calls.notices]).toEqual([
      [],
      ['Re-ran the failed jobs of typescript.', 'Re-ran the failed jobs of typescript.'],
    ]);
    expect(callLog(github)).toEqual([
      ['removeLabel', { ...REPO, issue_number: 7, name: 'accept-policy-change' }],
      ['getCollaboratorPermissionLevel', { ...REPO, username: 'reviewer' }],
      [
        'createCommitStatus',
        {
          ...REPO,
          sha: HEAD,
          state: 'success',
          context: 'nitpicker/policy-accepted',
          description: 'Accepted by reviewer for #7 into main',
        },
      ],
      [
        'listWorkflowRunsForRepo',
        { ...REPO, head_sha: HEAD, event: 'pull_request', per_page: 100 },
      ],
      ['reRunWorkflowFailedJobs', { ...REPO, run_id: 1 }],
      ['reRunWorkflowFailedJobs', { ...REPO, run_id: 2 }],
    ]);
  });

  it('re-runs an older failed run before a newer one, also when a run passed in between', async () => {
    const runs = [
      { id: 7, workflow_id: 1, name: 'typescript', status: 'completed', conclusion: 'failure' },
      { id: 6, workflow_id: 1, name: 'typescript', status: 'completed', conclusion: 'success' },
      { id: 4, workflow_id: 1, name: 'typescript', status: 'completed', conclusion: 'failure' },
    ];
    const github = fakeGithub({ permission: 'write', runs });

    await approve(github);

    expect(github.rest.actions.reRunWorkflowFailedJobs.mock.calls).toEqual([
      [{ ...REPO, run_id: 4 }],
      [{ ...REPO, run_id: 7 }],
    ]);
  });

  it('waits for a run that is still going, then re-runs it when it failed', async () => {
    vi.useFakeTimers();
    const github = fakeGithub({ permission: 'admin' });
    const run = { id: 4, workflow_id: 1, name: 'nitpicker' };
    github.rest.actions.listWorkflowRunsForRepo
      .mockResolvedValueOnce([{ ...run, status: 'in_progress', conclusion: null }])
      .mockResolvedValueOnce([{ ...run, status: 'completed', conclusion: 'failure' }]);

    const pending = approve(github);
    await vi.advanceTimersByTimeAsync(30_000);
    const calls = await pending;

    expect(calls.notices).toEqual(['Re-ran the failed jobs of nitpicker.']);
    expect(github.rest.actions.reRunWorkflowFailedJobs.mock.calls).toEqual([
      [{ ...REPO, run_id: 4 }],
    ]);
  });

  it('says so when runs are still going after the wait, or nothing failed', async () => {
    vi.useFakeTimers();
    const going = fakeGithub({
      permission: 'write',
      runs: [{ id: 4, workflow_id: 1, name: 'nitpicker', status: 'queued', conclusion: null }],
    });
    const passed = fakeGithub({ permission: 'write' });
    passed.rest.issues.removeLabel.mockRejectedValue(new Error('Label does not exist'));

    const waiting = approve(going);
    await vi.advanceTimersByTimeAsync(40 * 30_000);
    const notices = [(await waiting).notices, (await approve(passed)).notices];

    expect(notices).toEqual([
      ['Some runs of this commit are still going; re-run any that fails.'],
      ['Recorded the approval; no failed run of this commit to re-run.'],
    ]);
    expect(going.rest.actions.listWorkflowRunsForRepo.mock.calls).toHaveLength(41);
    expect(passed.rest.repos.createCommitStatus.mock.calls).toHaveLength(1);
  });

  it('refuses an approval too long for a commit status instead of failing to record it', async () => {
    const github = fakeGithub({ permission: 'admin' });
    const long = { ...LABELED.pull_request, base: { ref: 'b'.repeat(120) } };

    const calls = await runScript(job.steps[0].with.script, {
      github,
      payload: { ...LABELED, pull_request: long },
    });

    expect(calls.failed).toEqual([
      `"Accepted by reviewer for #7 into ${'b'.repeat(120)}" is longer than a commit status allows (140 characters). Accept with the NITPICKER_ACCEPT_POLICY_CHANGE digest instead.`,
    ]);
    expect(callLog(github).map(([name]) => name)).toEqual([
      'removeLabel',
      'getCollaboratorPermissionLevel',
    ]);
  });

  it.each([
    ['read', 'reviewer has read access.'],
    [undefined, 'reviewer has no access.'],
  ])('records nothing for a person with %s access', async (permission, start) => {
    const github = fakeGithub({ permission });

    const calls = await approve(github);

    expect(calls.failed).toEqual([
      `${start} Only a person with write access accepts a policy loosening.`,
    ]);
    expect(callLog(github).map(([name]) => name)).toEqual([
      'removeLabel',
      'getCollaboratorPermissionLevel',
    ]);
  });
});

describe('the approval read of action.yml', () => {
  const script = stepsById(readAction().runs.steps)['approval-status'].with.script;
  const environment = { HEAD_SHA: HEAD, PULL_REQUEST: '7', TARGET_BRANCH: 'main' };
  const read = (options) => runScript(script, { ...options, environment });
  const status = (state, changes = {}) => ({
    state,
    context: 'nitpicker/policy-accepted',
    description: 'Accepted by reviewer for #7 into main',
    creator: { login: 'github-actions[bot]' },
    ...changes,
  });
  const forPullRequest = (description) => status('success', { description });

  it.each([
    ['the latest approval succeeded', [status('success'), status('failure')], HEAD],
    ['the latest approval failed', [status('failure'), status('success')], ''],
    ['someone else set the status', [status('success', { creator: { login: 'someone' } })], ''],
    ['the status is another one', [status('success', { context: 'ci/other' })], ''],
    ['it is for another pull request', [forPullRequest('Accepted by r for #17 into main')], ''],
    ['it is for another target branch', [forPullRequest('Accepted by r for #7 into release')], ''],
    ['it has no description', [status('success', { description: null })], ''],
    ['there is no status', [], ''],
  ])('approves the head only when %s', async (_name, statuses, approved) => {
    const github = fakeGithub({ statuses });

    const calls = await read({ github });

    expect([calls.outputs, calls.warnings]).toEqual([{ 'approved-sha': approved }, []]);
    expect(callLog(github)).toEqual([
      ['listCommitStatusesForRef', { ...REPO, ref: HEAD, per_page: 100 }],
    ]);
  });

  it('warns and approves nothing when the statuses cannot be read', async () => {
    const github = fakeGithub({ statuses: new Error('Resource not accessible') });

    const calls = await read({ github });

    const message = `Could not read the policy approval of ${HEAD} (Resource not accessible). Give the job the statuses: read permission.`;

    expect([calls.outputs, calls.info, calls.warnings]).toEqual([
      { unreadable: message },
      [message],
      [],
    ]);
  });

  it('warns about an unreadable approval only when the gate fails', () => {
    const root = temporaryRoot('nitpicker-action-runner-');
    const fail = (environment) =>
      executeStep({
        step: actionStep('Fail when the gate failed'),
        root,
        cwd: root,
        environment: { EXIT_CODE: '1', ...environment },
        searchPath: process.env.PATH,
      });

    expect(fail({ APPROVAL_UNREADABLE: 'Could not read it.' }).stdout.split('\n')[0]).toBe(
      '::warning title=nitpicker::Could not read it. Without it, an accept-policy-change label approves nothing.',
    );
    expect(fail({}).stdout.split('\n')).toEqual([
      'nitpicker exited with code 1 (1: new enforceable findings or failing head tests, 2: a tool error or a failure to decide).',
      '',
    ]);
  });
});
