import { callPath, code } from './text.mjs';

const KINDS = { database: 'a query or write', remote: 'a remote request' };

function jobLoop({ method, job, kind, path }) {
  return [
    'Catch the failure of each item inside the loop and record it, or enqueue one job per item so the queue',
    `isolates them: the loop in the ${code(job)} job ${code(`${method}()`)} makes ${KINDS[kind]} for each item`,
    `(${callPath(path)}) with no \`try\` around it, so the first item that throws skips every item after it`,
    'until the next run, and an item that keeps failing blocks all the others. A job that fails on purpose',
    'so that the whole run is retried goes in `exceptions`.',
  ].join(' ');
}

export const JOB_MESSAGES = {
  JobLoopWithoutItemIsolation: jobLoop,
};
