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
const WORKFLOW = 7;

function run(id, status = 'completed') {
  return { id, status, html_url: `https://github.com/o/r/actions/runs/${id}` };
}

function checkRun(id, runId, conclusion, slug = 'github-actions') {
  return {
    id,
    status: conclusion === null ? 'in_progress' : 'completed',
    conclusion,
    app: { slug },
    html_url: `https://github.com/o/r/actions/runs/${runId}/job/${id}`,
  };
}

function fakes(...listings) {
  const github = {
    rest: {
      actions: {
        getWorkflowRun: vi.fn().mockResolvedValue({ data: { workflow_id: WORKFLOW } }),
        listWorkflowRuns: vi.fn(),
      },
      checks: { listForRef: vi.fn() },
    },
    paginate: vi.fn(),
  };
  for (const [runs, checkRuns] of listings) {
    github.paginate.mockResolvedValueOnce(runs).mockResolvedValueOnce(checkRuns);
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
  it('takes the latest attempt in the newest earlier run, past skipped jobs and other apps', () => {
    const checkRuns = [
      checkRun(1, 10, 'failure'),
      checkRun(9, 10, 'success'),
      checkRun(3, 11, 'skipped'),
      checkRun(4, 12, 'success', 'other-app'),
      checkRun(900, RUN_ID, null),
      checkRun(950, 51, 'failure'),
    ];
    const runs = [run(51), run(RUN_ID, 'in_progress'), run(12), run(11), run(10)];

    expect(lastResult({ runs, checkRuns, runId: RUN_ID })).toEqual({ last: checkRuns[1] });
  });

  it('waits for an earlier run that is still going, also before its job has a check run', () => {
    const runs = [run(9), run(10, 'queued'), run(51, 'in_progress')];

    expect(lastResult({ runs, checkRuns: [checkRun(1, 9, 'success')], runId: RUN_ID })).toEqual({
      pending: runs[1],
    });
    expect(lastResult({ runs: [run(51, 'in_progress')], checkRuns: [], runId: RUN_ID })).toEqual({
      last: undefined,
    });
  });
});

describe('copyLastResult', () => {
  it('passes with the passing result it keeps, listing the runs of its own workflow', async () => {
    const { github, core, context } = fakes([[run(12)], [checkRun(2, 12, 'success')]]);

    await copyLastResult({ github, context, core, check: 'test' });

    expect(github.paginate.mock.calls).toEqual([
      [
        github.rest.actions.listWorkflowRuns,
        { owner: 'o', repo: 'r', workflow_id: WORKFLOW, head_sha: SHA, per_page: 100 },
      ],
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
    const failed = fakes([[run(12)], [checkRun(2, 12, 'cancelled')]]);
    const never = fakes([[run(11)], [checkRun(3, 11, 'skipped')]]);

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

  it('waits for an earlier run to end, and fails when it does not end in time', async () => {
    const pause = vi.fn().mockResolvedValue(undefined);
    const going = [[run(10, 'in_progress')], []];
    const ends = fakes(going, [[run(10)], [checkRun(5, 10, 'failure')]]);
    const stuck = fakes(going, going, going);

    await copyLastResult({ ...ends, check: 'java', pause });
    await copyLastResult({ ...stuck, check: 'java', pause, polls: 2 });

    expect([ends.core.info.mock.calls, ends.core.setFailed.mock.calls.length]).toEqual([
      [['Waiting for https://github.com/o/r/actions/runs/10 to finish.']],
      1,
    ]);
    expect([stuck.core.setFailed.mock.calls, pause.mock.calls]).toEqual([
      [
        [
          'java: https://github.com/o/r/actions/runs/10 is still going. Add run-ci again once it ends.',
        ],
      ],
      [[30_000], [30_000], [30_000]],
    ]);
  });
});

function summaryJobs(parsed) {
  return Object.entries(parsed.jobs).filter(([, job]) => String(job.if).includes('always()'));
}

const COPY = `\${{ github.event_name == 'pull_request' && github.event.label.name != 'run-ci' }}`;

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
          `const { copyLastResult } = await import(\`\${process.env.GITHUB_WORKSPACE}/scripts/ci/last-result.mjs\`);`,
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
      expect(definition.permissions).toEqual({ contents: 'read', checks: 'read', actions: 'read' });
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
        COPY_LAST_RESULT: COPY.replace(
          ' }}',
          " && github.event.label.name != 'accept-policy-change' }}",
        ),
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
