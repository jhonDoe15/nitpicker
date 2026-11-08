import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { copyLastResult, lastResult } from './last-result.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const workflowsDirectory = path.join(root, '.github/workflows');
const labeled = readdirSync(workflowsDirectory)
  .filter((name) => name.endsWith('.yml'))
  .map((name) => ({
    name,
    parsed: parse(readFileSync(path.join(workflowsDirectory, name), 'utf8')),
  }))
  .filter(({ parsed }) => parsed.on?.pull_request?.types?.includes('labeled'));

const RUN_ID = 50;
const SHA = 'a'.repeat(40);

function checkRun(id, runId, status, conclusion = null, slug = 'github-actions') {
  return {
    id,
    status,
    conclusion,
    app: { slug },
    html_url: `https://github.com/o/r/actions/runs/${runId}/job/${id}`,
  };
}

const current = checkRun(900, RUN_ID, 'in_progress');

function fakes(...listings) {
  const listForRef = vi.fn();
  const github = { rest: { checks: { listForRef } }, paginate: vi.fn() };
  for (const listing of listings) {
    github.paginate.mockResolvedValueOnce(listing);
  }
  const core = { notice: vi.fn(), info: vi.fn(), setFailed: vi.fn() };
  const context = {
    repo: { owner: 'o', repo: 'r' },
    runId: RUN_ID,
    payload: { pull_request: { head: { sha: SHA } } },
  };
  return { github, core, context };
}

describe('lastResult', () => {
  it('takes the newest completed result before this job, past skipped ones and other apps', () => {
    const runs = [
      checkRun(1, 10, 'completed', 'failure'),
      checkRun(3, 11, 'completed', 'skipped'),
      checkRun(2, 12, 'completed', 'success'),
      checkRun(4, 13, 'completed', 'success', 'other-app'),
      current,
      checkRun(950, 51, 'completed', 'success'),
    ];

    expect(lastResult(runs, RUN_ID)).toEqual({ last: runs[2] });
  });

  it('waits for an earlier check that is still going, but not for a later one', () => {
    const going = checkRun(5, 10, 'queued');

    expect(lastResult([checkRun(1, 9, 'completed', 'success'), going, current], RUN_ID)).toEqual({
      pending: going,
    });
    expect(lastResult([checkRun(901, 52, 'in_progress'), current], RUN_ID)).toEqual({
      last: undefined,
    });
  });

  it('counts an earlier attempt of this run as a result', () => {
    const attempt = checkRun(7, RUN_ID, 'completed', 'failure');

    expect(lastResult([attempt, current], RUN_ID)).toEqual({ last: attempt });
  });
});

describe('copyLastResult', () => {
  it('passes with the passing result it keeps', async () => {
    const { github, core, context } = fakes([checkRun(2, 12, 'completed', 'success'), current]);

    await copyLastResult({ github, context, core, check: 'test' });

    expect(github.paginate.mock.calls).toEqual([
      [
        github.rest.checks.listForRef,
        { owner: 'o', repo: 'r', ref: SHA, check_name: 'test', filter: 'all', per_page: 100 },
      ],
    ]);
    expect([core.notice.mock.calls, core.setFailed.mock.calls]).toEqual([
      [
        [
          'test keeps the passing result of https://github.com/o/r/actions/runs/12/job/2; a label other than run-ci runs no CI.',
        ],
      ],
      [],
    ]);
  });

  it('fails with a failed result, and when CI has not run on the commit', async () => {
    const failed = fakes([checkRun(2, 12, 'completed', 'cancelled'), current]);
    const never = fakes([checkRun(3, 11, 'completed', 'skipped'), current]);

    await copyLastResult({ ...failed, check: 'self-gate' });
    await copyLastResult({ ...never, check: 'self-gate' });

    expect([failed.core.setFailed.mock.calls, never.core.setFailed.mock.calls]).toEqual([
      [
        [
          'self-gate keeps the cancelled result of https://github.com/o/r/actions/runs/12/job/2; a label other than run-ci runs no CI. Add run-ci to run it again.',
        ],
      ],
      [['self-gate has not run on this commit. Add the run-ci label to run CI.']],
    ]);
  });

  it('waits for an earlier check to end, and fails when it does not end in time', async () => {
    const going = checkRun(5, 10, 'in_progress');
    const pause = vi.fn().mockResolvedValue(undefined);
    const ends = fakes(
      [going, current],
      [{ ...going, status: 'completed', conclusion: 'failure' }, current],
    );
    const stuck = fakes([going, current], [going, current], [going, current]);

    await copyLastResult({ ...ends, check: 'java', pause });
    await copyLastResult({ ...stuck, check: 'java', pause, polls: 2 });

    expect([ends.core.setFailed.mock.calls.length, ends.github.paginate.mock.calls.length]).toEqual(
      [1, 2],
    );
    expect([
      stuck.core.setFailed.mock.calls,
      stuck.github.paginate.mock.calls.length,
      pause.mock.calls,
    ]).toEqual([
      [
        [
          'java: https://github.com/o/r/actions/runs/10/job/5 is still going. Add run-ci again once it ends.',
        ],
      ],
      3,
      [[20_000], [20_000], [20_000]],
    ]);
  });
});

function summaryJobs(parsed) {
  return Object.entries(parsed.jobs).filter(([, job]) => String(job.if).includes('always()'));
}

const COPY = "${{ github.event_name == 'pull_request' && github.event.label.name != 'run-ci' }}";

function copySteps(check) {
  return [
    {
      uses: 'actions/checkout@v7.0.1',
      if: "env.COPY_LAST_RESULT == 'true'",
      with: { 'sparse-checkout': 'scripts/ci' },
    },
    {
      name: `Keep the last ${check} result of this commit`,
      if: "env.COPY_LAST_RESULT == 'true'",
      uses: 'actions/github-script@v8.0.0',
      with: {
        script: [
          'const { copyLastResult } = await import(`${process.env.GITHUB_WORKSPACE}/scripts/ci/last-result.mjs`);',
          `await copyLastResult({ github, context, core, check: '${check}' });`,
          '',
        ].join('\n'),
      },
    },
  ];
}

describe('workflows that run on a label', () => {
  const summaries = labeled.flatMap(({ name, parsed }) =>
    summaryJobs(parsed).map(([job, definition]) => [`${name} ${job}`, job, definition]),
  );

  it('have a summary job in every workflow that has needs', () => {
    expect(summaries.map(([id]) => id)).toEqual([
      'go-e2e.yml go-e2e',
      'java-e2e.yml java',
      'kotlin-e2e.yml kotlin',
      'platforms.yml platforms',
      'python-e2e.yml python-e2e',
      'typescript.yml test',
    ]);
  });

  it.each(summaries)(
    '%s: keeps the last result on another label instead of skipping',
    (id, job, definition) => {
      expect(definition.if).toBe('always()');
      expect(definition.env).toEqual({ COPY_LAST_RESULT: COPY });
      expect(definition.permissions).toEqual({ contents: 'read', checks: 'read' });
      expect(definition.steps.slice(-2)).toEqual(copySteps(job));
      expect(
        definition.steps
          .slice(0, -2)
          .filter((step) => !String(step.if).includes("env.COPY_LAST_RESULT != 'true'")),
      ).toEqual([]);
    },
  );

  it('runs the self-gate on the run-ci and accept-policy-change labels and keeps it on others', () => {
    const typescript = labeled.find(({ name }) => name === 'typescript.yml').parsed;
    const gate = typescript.jobs['self-gate'];

    expect([gate.if, gate.env]).toEqual([
      "github.ref != 'refs/heads/main'",
      {
        COPY_LAST_RESULT:
          "${{ github.event_name == 'pull_request' && github.event.label.name != 'run-ci' && github.event.label.name != 'accept-policy-change' }}",
      },
    ]);
    expect(gate.steps.slice(-2)).toEqual(copySteps('self-gate'));
    expect(
      gate.steps
        .slice(0, -2)
        .filter((step) => !String(step.if).includes("env.COPY_LAST_RESULT != 'true'")),
    ).toEqual([]);
  });
});
