import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads';
import { chainOf } from '../../traversal.mjs';
import { checkoutModuleUrl } from '../../paths/checkout-module.mjs';

const DEFAULT_TIMEOUT_MS = 20_000;
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

/**
 * `decide` for synchronous callers such as lint rules: the solver runs in a worker thread and this
 * call blocks until it answers. A solver that does not answer within `timeoutMs` counts as 'open',
 * and so does every call while that answer is still pending or after the worker stopped.
 */
export function decideSync(conditions, query, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...decideOptions } = options;
  return ask({ explain: false, conditions, query, options: decideOptions }, timeoutMs) ?? 'open';
}

export function counterexampleSync(conditions, query, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...decideOptions } = options;
  const result = ask({ explain: true, conditions, query, options: decideOptions }, timeoutMs);
  return result === undefined || result === 'none' ? undefined : result;
}
