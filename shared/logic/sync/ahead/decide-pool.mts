import { repliesFrom, solverThread } from '../decide-sync.mts';
import type { DecisionQuestion, SolverReply } from '../../typed/solver-types.mts';

type Member = ReturnType<typeof solverThread>;
type DispatchState = { next: number; answered: number; results: unknown[] };
type Dispatcher = {
  readonly state: DispatchState;
  readonly send: (member: Member) => void;
  readonly collect: (member: Member) => number;
};

const SAFETY_NET_MS = 120_000;
const IN_FLIGHT = 2;

function startMember(signal: Int32Array): Member {
  const member = solverThread(signal);
  member.worker.on('error', () => undefined);
  return member;
}

function repliesOf(member: Member): SolverReply[] {
  return repliesFrom(member.replies);
}

function dispatcher(requests: readonly DecisionQuestion[]): Dispatcher {
  const state: DispatchState = {
    next: 0,
    answered: 0,
    results: Array.from({ length: requests.length }),
  };
  function send(member: Member): void {
    if (state.next < requests.length) {
      member.worker.postMessage({ id: state.next + 1, ...requests[state.next] });
      state.next += 1;
    }
  }
  function collect(member: Member): number {
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

function waitsWhile(isWaiting: () => boolean): Iterable<number> {
  const iterator: Iterator<number> = {
    next() {
      return isWaiting() ? { done: false, value: SAFETY_NET_MS } : { done: true, value: undefined };
    },
  };
  return { [Symbol.iterator]: () => iterator };
}

function awaitReplies(signal: Int32Array, pool: Member[], { state, collect }: Dispatcher): void {
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

export function decideAll(
  requests: readonly DecisionQuestion[],
  { workers }: { readonly workers: number },
): unknown[] {
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
