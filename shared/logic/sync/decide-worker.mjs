import { parentPort, workerData } from 'node:worker_threads';
import { decide } from '../decide.mjs';

const { signal, replies } = workerData;

async function answer({ id, conditions, query, options }) {
  const result = await decide(conditions, query, options).catch(() => 'open');
  replies.postMessage({ id, result });
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
}

parentPort.on('message', (request) => {
  void answer(request);
});
