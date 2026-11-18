import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads';
import { checkoutModuleUrl } from '../../../paths/checkout-module.mjs';
import { chainOf } from '../../../traversal.mjs';

const SAFETY_NET_MS = 120_000;
const IN_FLIGHT = 2;
const WORKER = checkoutModuleUrl(new URL('../decide-worker.mjs', import.meta.url));

function startMember(signal) {
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(WORKER, {
    workerData: { signal, replies: port2 },
    transferList: [port2],
  });
  worker.on('error', () => undefined);
  worker.unref();
  port1.unref();
  return { worker, replies: port1 };
}

function repliesOf(member) {
  return chainOf(receiveMessageOnPort(member.replies), () =>
    receiveMessageOnPort(member.replies),
  ).map(({ message }) => message);
}

function dispatcher(requests) {
  const state = { next: 0, answered: 0, results: Array.from({ length: requests.length }) };
  function send(member) {
    if (state.next < requests.length) {
      member.worker.postMessage({ id: state.next + 1, ...requests[state.next] });
      state.next += 1;
    }
  }
  function collect(member) {
    const replies = repliesOf(member).filter(
      ({ id }) => id > 0 && id <= state.next && state.results[id - 1] === undefined,
    );
    for (const { id, result } of replies) {
      state.results[id - 1] = result;
      state.answered += 1;
      send(member);
    }
    return replies.length;
  }
  return { state, send, collect };
}

function waitForReplies(signal, pool, { state, collect }) {
  let quietSince = Date.now();
  while (state.answered < state.next && Date.now() - quietSince < SAFETY_NET_MS) {
    Atomics.wait(signal, 0, 0, SAFETY_NET_MS);
    Atomics.store(signal, 0, 0);
    const received = pool.reduce((sum, member) => sum + collect(member), 0);
    if (received > 0) {
      quietSince = Date.now();
    }
  }
}

/**
 * The solver's answers to `requests` (each `{ explain, conditions, query, options }`, as a
 * synchronous call asks it), in the order asked, from up to `workers` solver threads at once. A
 * question with no answer within the safety net has `undefined`.
 */
export function decideAll(requests, { workers }) {
  const size = Math.max(1, Math.min(workers, requests.length));
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const pool = Array.from({ length: size }, () => startMember(signal));
  const dispatch = dispatcher(requests);
  try {
    for (let round = 0; round < IN_FLIGHT; round += 1) {
      pool.forEach(dispatch.send);
    }
    waitForReplies(signal, pool, dispatch);
    return dispatch.state.results;
  } finally {
    for (const member of pool) {
      void member.worker.terminate();
    }
  }
}
