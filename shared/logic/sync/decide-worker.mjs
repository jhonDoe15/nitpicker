import { parentPort, workerData } from 'node:worker_threads';
import { decide } from '../decide.mjs';

async function answer({ id, conditions, query, options }, { signal, replies }) {
  try {
    replies.postMessage({ id, result: await decide(conditions, query, options) });
  } catch (error) {
    replies.postMessage({ id, result: 'open', failure: String(error) });
  } finally {
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);
  }
}

async function drain(queue, channels) {
  for (const request of queue) {
    await answer(request, channels);
  }
  queue.length = 0;
}

/**
 * Answers the solver requests of `decideSync` one at a time, in the order they came, since the
 * solver cannot run two checks at once; the worker thread's entry calls it.
 */
export function serveDecisions(port, channels) {
  const queue = [];
  port.on('message', (request) => {
    queue.push(request);
    if (queue.length === 1) {
      void drain(queue, channels);
    }
  });
}

serveDecisions(parentPort, workerData);
