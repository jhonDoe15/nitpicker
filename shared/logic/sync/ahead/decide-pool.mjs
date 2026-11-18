import { receiveMessageOnPort } from 'node:worker_threads';
import { chainOf } from '../../../traversal.mjs';
import { solverThread } from '../decide-sync.mjs';

const SAFETY_NET_MS = 120_000;
const IN_FLIGHT = 2;

function startMember(signal) {
  const member = solverThread(signal);
  member.worker.on('error', () => undefined);
  return member;
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

function waitsWhile(isWaiting) {
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      return isWaiting() ? { done: false, value: SAFETY_NET_MS } : { done: true, value: undefined };
    },
  };
}

function awaitReplies(signal, pool, { state, collect }) {
  const quiet = { since: Date.now() };
  function isWaiting() {
    return state.answered < state.next && Date.now() - quiet.since < SAFETY_NET_MS;
  }
  for (const limit of waitsWhile(isWaiting)) {
    Atomics.wait(signal, 0, 0, limit);
    Atomics.store(signal, 0, 0);
    if (pool.reduce((sum, member) => sum + collect(member), 0) > 0) {
      quiet.since = Date.now();
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
    for (const member of Array.from({ length: IN_FLIGHT }, () => pool).flat()) {
      dispatch.send(member);
    }
    awaitReplies(signal, pool, dispatch);
    return dispatch.state.results;
  } finally {
    for (const member of pool) {
      member.worker.postMessage({ stop: true });
    }
  }
}
