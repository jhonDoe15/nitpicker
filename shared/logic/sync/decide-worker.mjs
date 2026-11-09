import { parentPort, workerData } from 'node:worker_threads';
import { decide } from '../decide.mjs';

async function answer({ id, conditions, query, options }, { signal, replies }) {
  try {
    replies.postMessage({ id, result: await decide(conditions, query, options) });
  } catch {
    replies.postMessage({ id, result: 'open' });
  } finally {
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);
  }
}

/** Answers the solver requests of `decideSync`; the worker thread's entry calls it. */
export function serveDecisions(port, channels) {
  port.on('message', (request) => {
    void answer(request, channels);
  });
}

serveDecisions(parentPort, workerData);
