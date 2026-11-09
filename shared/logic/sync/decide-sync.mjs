import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads';

const DEFAULT_TIMEOUT_MS = 20_000;
const WORKER = new URL('decide-worker.mjs', import.meta.url);

function startBridge() {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(WORKER, {
    workerData: { signal, replies: port2 },
    transferList: [port2],
  });
  worker.unref();
  port1.unref();
  return { worker, signal, replies: port1, next: 0 };
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

function replyTo(bridge, id) {
  for (let message = receiveMessageOnPort(bridge.replies); message !== undefined;) {
    if (message.message.id === id) {
      return message.message.result;
    }
    message = receiveMessageOnPort(bridge.replies);
  }
  return undefined;
}

function awaitReply(bridge, id, deadline) {
  for (let left = deadline - Date.now(); left > 0; left = deadline - Date.now()) {
    Atomics.wait(bridge.signal, 0, 0, left);
    Atomics.store(bridge.signal, 0, 0);
    const result = replyTo(bridge, id);
    if (result !== undefined) {
      return result;
    }
  }
  return 'open';
}

/**
 * `decide` for synchronous callers such as lint rules: the solver runs in a worker thread and this
 * call blocks until it answers. A solver that does not answer within `timeoutMs` counts as 'open'.
 */
export function decideSync(conditions, query, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...decideOptions } = options;
  const current = bridge();
  current.next += 1;
  const id = current.next;
  Atomics.store(current.signal, 0, 0);
  current.worker.postMessage({ id, conditions, query, options: decideOptions });
  return awaitReply(current, id, Date.now() + timeoutMs);
}
