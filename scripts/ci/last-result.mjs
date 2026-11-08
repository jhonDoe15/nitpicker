import { setTimeout as sleep } from 'node:timers/promises';

const POLL_MS = 20_000;
const POLLS = 120;

function newest(checkRuns) {
  return checkRuns.reduce(
    (last, run) => (last === undefined || run.id > last.id ? run : last),
    undefined,
  );
}

function inRun(checkRun, runId) {
  return checkRun.html_url?.includes(`/actions/runs/${runId}/`) === true;
}

export function lastResult(checkRuns, runId) {
  const own = checkRuns.filter((run) => run.app?.slug === 'github-actions');
  const current = own.filter((run) => inRun(run, runId) && run.status !== 'completed');
  if (current.length === 0) {
    return { listed: false };
  }
  const before = Math.min(...current.map((run) => run.id));
  const earlier = own.filter((run) => run.id < before && !inRun(run, runId));
  const pending = earlier.filter((run) => run.status !== 'completed');
  if (pending.length > 0) {
    return { listed: true, pending: newest(pending) };
  }
  return { listed: true, last: newest(earlier.filter((run) => run.conclusion !== 'skipped')) };
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

export async function copyLastResult({
  github,
  context,
  core,
  check,
  pause = sleep,
  polls = POLLS,
}) {
  const listing = {
    ...context.repo,
    ref: context.payload.pull_request.head.sha,
    check_name: check,
    filter: 'all',
    per_page: 100,
  };
  for (const poll of Array.from({ length: polls + 1 }, (_, index) => index)) {
    const { listed, pending, last } = lastResult(
      await github.paginate(github.rest.checks.listForRef, listing),
      context.runId,
    );
    if (listed && pending === undefined) {
      report(core, check, last);
      return;
    }
    const awaited = pending?.html_url ?? 'the check run of this job';
    if (poll < polls) {
      core.info(`Waiting for ${awaited} to be listed or to finish.`);
      await pause(POLL_MS);
    } else {
      core.setFailed(`${check}: ${awaited} is still going. Add run-ci again once it ends.`);
    }
  }
}
