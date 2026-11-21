import {
  MessageChannel,
  type MessagePort,
  Worker,
  receiveMessageOnPort,
} from 'node:worker_threads';
import { chainOf } from '../../traversal.mts';
import { checkoutModuleUrl } from '../../paths/checkout-module.mts';
import { spendRun } from './budget.mts';
import { aheadAnswers } from './ahead-answers.mts';
import type {
  AnswerStore,
  DecideSyncOptions,
  DecisionQuestion,
  SolverBudget,
  SolverReply,
} from '../typed/solver-types.mts';
import type { Term } from '../typed/term-types.mts';
import type { Finding } from '../../values/findings.mts';

type Bridge = {
  readonly worker: Worker;
  readonly signal: Int32Array;
  readonly replies: MessagePort;
  next: number;
  waiting: number | undefined;
  isDead: boolean;
};
type Pending = { readonly message: unknown };

const SAFETY_NET_MS = 120_000;
const MAX_ANSWERS = 20_000;
const WORKER = checkoutModuleUrl(new URL('decide-worker.mjs', import.meta.url));

export function solverThread(signal: Int32Array): { worker: Worker; replies: MessagePort } {
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(WORKER, {
    workerData: { signal, replies: port2 },
    transferList: [port2],
  });
  worker.unref();
  port1.unref();
  return { worker, replies: port1 };
}

function startBridge(): Bridge {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const { worker, replies } = solverThread(signal);
  const bridge: Bridge = { worker, signal, replies, next: 0, waiting: undefined, isDead: false };
  function stop() {
    bridge.isDead = true;
  }
  worker.on('error', stop);
  worker.on('exit', stop);
  return bridge;
}

function bridgeOnce(): () => Bridge {
  const bridges: Bridge[] = [];
  return () => {
    const [existing] = bridges;
    if (existing !== undefined) {
      return existing;
    }
    const started = startBridge();
    bridges.push(started);
    return started;
  };
}

const bridge = bridgeOnce();

function answerCache(): AnswerStore {
  const known = new Map<string, unknown>();
  return {
    find: (id) => known.get(id),
    keep(id, result) {
      if (known.size < MAX_ANSWERS) {
        known.set(id, result);
      }
    },
  };
}

function sharedAnswers(): { current: () => AnswerStore; share: (store: AnswerStore) => void } {
  const nothing = new Map<string, unknown>();
  const holder: { store: AnswerStore } = {
    store: { find: (id) => nothing.get(id), keep: () => undefined },
  };
  return {
    current: () => holder.store,
    share(store) {
      holder.store = store;
    },
  };
}

const answers = answerCache();
const answersByTerms = answerCache();
const ahead = aheadAnswers();
const shared = sharedAnswers();

function nextMessage(port: MessagePort): Pending | undefined {
  return receiveMessageOnPort(port);
}

function isReply(value: unknown): value is SolverReply {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'id') === 'number'
  );
}

export function repliesFrom(port: MessagePort): SolverReply[] {
  return chainOf(nextMessage(port), () => nextMessage(port))
    .map(({ message }) => message)
    .filter(isReply);
}

function replyTo(bridge: Bridge, id: number): SolverReply | undefined {
  return repliesFrom(bridge.replies).find((reply) => reply.id === id);
}

function waits(deadline: number): Iterable<number> {
  const iterator: Iterator<number> = {
    next() {
      const left = deadline - Date.now();
      return left > 0 ? { done: false, value: left } : { done: true, value: undefined };
    },
  };
  return { [Symbol.iterator]: () => iterator };
}

function awaitReply(bridge: Bridge, id: number, deadline: number): SolverReply | undefined {
  for (const left of waits(deadline)) {
    Atomics.wait(bridge.signal, 0, 0, left);
    Atomics.store(bridge.signal, 0, 0);
    const reply = replyTo(bridge, id);
    if (reply !== undefined) {
      return reply;
    }
  }
  return undefined;
}

function isBusy(bridge: Bridge): boolean {
  if (bridge.waiting !== undefined && replyTo(bridge, bridge.waiting) !== undefined) {
    bridge.waiting = undefined;
  }
  return bridge.waiting !== undefined;
}

function ask(request: DecisionQuestion, timeoutMs: number): SolverReply | undefined {
  const current = bridge();
  if (current.isDead || isBusy(current)) {
    return undefined;
  }
  current.next += 1;
  const id = current.next;
  Atomics.store(current.signal, 0, 0);
  current.worker.postMessage({ id, ...request });
  current.waiting = id;
  const reply = awaitReply(current, id, Date.now() + timeoutMs);
  if (reply !== undefined) {
    current.waiting = undefined;
  }
  return reply;
}

function withoutRange(key: string, value: unknown): unknown {
  return key === 'range' ? undefined : value;
}

function solved(request: DecisionQuestion, timeoutMs: number): SolverReply | undefined {
  if (request.explain) {
    return ask(request, timeoutMs);
  }
  const sameTerms = JSON.stringify(request, withoutRange);
  const found = answersByTerms.find(sameTerms);
  const reply = isReply(found) ? found : ask(request, timeoutMs);
  if (reply?.result !== undefined) {
    answersByTerms.keep(sameTerms, reply);
  }
  return reply;
}

function answered(
  request: DecisionQuestion,
  {
    timeoutMs = SAFETY_NET_MS,
    budget,
  }: { timeoutMs?: number | undefined; budget?: SolverBudget | undefined },
): unknown {
  const id = JSON.stringify(request);
  const known = answers.find(id);
  if (known !== undefined) {
    return known;
  }
  if (!spendRun(budget)) {
    return undefined;
  }
  return ahead.isNoting() ? noted(id, request) : settled(id, () => solved(request, timeoutMs));
}

function noted(id: string, request: DecisionQuestion): unknown {
  const found = ahead.find(id) ?? shared.current().find(id);
  if (found === undefined) {
    ahead.note(id, request);
  }
  return found;
}

function settled(id: string, askSolver: () => SolverReply | undefined): unknown {
  const found = ahead.find(id) ?? shared.current().find(id);
  const reply = found === undefined ? askSolver() : undefined;
  const result = found ?? reply?.result;
  if (result !== undefined) {
    answers.keep(id, result);
  }
  if (reply?.result !== undefined && reply.failure === undefined) {
    shared.current().keep(id, reply.result);
  }
  return result;
}

export function shareSolverAnswers(store: AnswerStore): void {
  shared.share(store);
}

export function noteQuestions(
  run: () => unknown,
  { keepSettled }: { readonly keepSettled: boolean },
): [string, DecisionQuestion][] {
  return ahead.noted(run, keepSettled);
}

export function answerAhead(found: Iterable<[string, unknown]>): void {
  ahead.keep(found);
}

export function settledAhead(key: object, run: () => Finding[]): Finding[] {
  return ahead.settledOr(key, run);
}

export function forgetAnswersAhead(): void {
  ahead.forget();
}

export function isNoting(): boolean {
  return ahead.isNoting();
}

function reply(asked: Omit<DecisionQuestion, 'options'>, options: DecideSyncOptions): unknown {
  const { timeoutMs, budget, ...decideOptions } = options;
  const request = { ...asked, options: decideOptions };
  return answered(request, { timeoutMs, budget });
}

export function decideSync(
  conditions: readonly Term[],
  query: Term,
  options: DecideSyncOptions = {},
): string {
  const answer = reply({ explain: false, conditions, query }, options);
  return typeof answer === 'string' ? answer : 'open';
}

export function counterexampleSync(
  conditions: readonly Term[],
  query: Term,
  options: DecideSyncOptions = {},
): string | undefined {
  const result = reply({ explain: true, conditions, query }, options);
  return typeof result === 'string' && result !== 'none' ? result : undefined;
}
