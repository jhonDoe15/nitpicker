import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads';
import { chainOf } from '../../traversal.mjs';
import { checkoutModuleUrl } from '../../paths/checkout-module.mjs';
import { spendRun } from './budget.mjs';

const SAFETY_NET_MS = 120_000;
const MAX_ANSWERS = 20_000;
const WORKER = checkoutModuleUrl(new URL('decide-worker.mjs', import.meta.url));

function startBridge() {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(WORKER, {
    workerData: { signal, replies: port2 },
    transferList: [port2],
  });
  worker.unref();
  port1.unref();
  const bridge = { worker, signal, replies: port1, next: 0, waiting: undefined, isDead: false };
  function stop() {
    bridge.isDead = true;
  }
  worker.on('error', stop);
  worker.on('exit', stop);
  return bridge;
}

function bridgeOnce() {
  const bridges = [];
  return () => {
    if (bridges.length === 0) {
      bridges.push(startBridge());
    }
    return bridges[0];
  };
}

const bridge = bridgeOnce();

function answerCache() {
  const known = new Map();
  return {
    find: (id) => known.get(id),
    keep(id, result) {
      if (known.size < MAX_ANSWERS) {
        known.set(id, result);
      }
    },
  };
}

const answers = answerCache();

function pendingReplies(bridge) {
  return chainOf(receiveMessageOnPort(bridge.replies), () => receiveMessageOnPort(bridge.replies));
}

function replyTo(bridge, id) {
  return pendingReplies(bridge).find(({ message }) => message.id === id)?.message.result;
}

function waits(deadline) {
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      const left = deadline - Date.now();
      return left > 0 ? { done: false, value: left } : { done: true, value: undefined };
    },
  };
}

function awaitReply(bridge, id, deadline) {
  for (const left of waits(deadline)) {
    Atomics.wait(bridge.signal, 0, 0, left);
    Atomics.store(bridge.signal, 0, 0);
    const result = replyTo(bridge, id);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}

function isBusy(bridge) {
  if (bridge.waiting !== undefined && replyTo(bridge, bridge.waiting) !== undefined) {
    bridge.waiting = undefined;
  }
  return bridge.waiting !== undefined;
}

function ask(request, timeoutMs) {
  const current = bridge();
  if (current.isDead || isBusy(current)) {
    return undefined;
  }
  current.next += 1;
  const id = current.next;
  Atomics.store(current.signal, 0, 0);
  current.worker.postMessage({ id, ...request });
  current.waiting = id;
  const result = awaitReply(current, id, Date.now() + timeoutMs);
  if (result !== undefined) {
    current.waiting = undefined;
  }
  return result;
}

function answered(request, { timeoutMs = SAFETY_NET_MS, budget }) {
  const id = JSON.stringify(request);
  const known = answers.find(id);
  if (known !== undefined) {
    return known;
  }
  if (!spendRun(budget)) {
    return undefined;
  }
  const result = ask(request, timeoutMs);
  if (result !== undefined) {
    answers.keep(id, result);
  }
  return result;
}

function reply(asked, options) {
  const { timeoutMs, budget, ...decideOptions } = options;
  const request = { ...asked, options: decideOptions };
  return answered(request, { timeoutMs, budget });
}

/**
 * `decide` for synchronous callers such as lint rules: the solver runs in a worker thread and this
 * call blocks until it answers. Answers are kept by the terms asked. The solver stops at its
 * resource limit (`options.resourceLimit`), the same on every machine; `timeoutMs` is only a safety
 * net far above any normal answer. A question that runs out of either, that exceeds `options.budget`
 * (see `solverBudget`) or that arrives while an answer is pending or after the worker stopped is 'open'.
 */
export function decideSync(conditions, query, options = {}) {
  return reply({ explain: false, conditions, query }, options) ?? 'open';
}

export function counterexampleSync(conditions, query, options = {}) {
  const result = reply({ explain: true, conditions, query }, options);
  return result === undefined || result === 'none' ? undefined : result;
}
