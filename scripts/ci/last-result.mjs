import { setTimeout as sleep } from 'node:timers/promises';

const POLL_MS = 30_000;
const POLLS = 200;

function runOf(checkRun) {
  return Number(/\/actions\/runs\/(\d+)\//u.exec(checkRun.html_url ?? '')?.[1]);
}

function latestAttempt(checkRuns, runId) {
  return checkRuns
    .filter((checkRun) => runOf(checkRun) === runId)
    .reduce(
      (last, checkRun) => (last === undefined || checkRun.id > last.id ? checkRun : last),
      undefined,
    );
}

export function lastResult({ runs, checkRuns, runId }) {
  const earlier = runs.filter((run) => run.id < runId).toSorted((a, b) => b.id - a.id);
  const pending = earlier.find((run) => run.status !== 'completed');
  if (pending !== undefined) {
    return { pending };
  }
  const own = checkRuns.filter((checkRun) => checkRun.app?.slug === 'github-actions');
  const last = earlier
    .map((run) => latestAttempt(own, run.id))
    .find((checkRun) => checkRun !== undefined && checkRun.conclusion !== 'skipped');
  return { last };
}

function report(core, check, last) {
  if (last === undefined) {
    core.setFailed(`${check} has not run on this commit. Add the run-ci label to run CI.`);
  } else if (last.conclusion === 'success') {
    core.notice(
      `${check} keeps the passing result of ${last.html_url}; a label other than run-ci runs no CI.`,
    );
  } else {
    core.setFailed(
      `${check} keeps the ${last.conclusion} result of ${last.html_url}; a label other than run-ci runs no CI. ` +
        'Add run-ci to run it again.',
    );
  }
}

async function listResults({ github, context, check, workflowId }) {
  const sha = context.payload.pull_request.head.sha;
  const [runs, checkRuns] = await Promise.all([
    github.paginate(github.rest.actions.listWorkflowRuns, {
      ...context.repo,
      workflow_id: workflowId,
      head_sha: sha,
      per_page: 100,
    }),
    github.paginate(github.rest.checks.listForRef, {
      ...context.repo,
      ref: sha,
      check_name: check,
      filter: 'all',
      per_page: 100,
    }),
  ]);
  return lastResult({ runs, checkRuns, runId: context.runId });
}

export async function copyLastResult({
  github,
  context,
  core,
  check,
  pause = sleep,
  polls = POLLS,
}) {
  const { data: run } = await github.rest.actions.getWorkflowRun({
    ...context.repo,
    run_id: context.runId,
  });
  for (const poll of Array.from({ length: polls + 1 }, (_, index) => index)) {
    const { pending, last } = await listResults({
      github,
      context,
      check,
      workflowId: run.workflow_id,
    });
    if (pending === undefined) {
      report(core, check, last);
      return;
    }
    if (poll < polls) {
      core.info(`Waiting for ${pending.html_url} to finish.`);
      await pause(POLL_MS);
    } else {
      core.setFailed(
        `${check}: ${pending.html_url} is still going. Add run-ci again once it ends.`,
      );
    }
  }
}
