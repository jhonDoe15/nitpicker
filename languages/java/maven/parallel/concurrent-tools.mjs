import { availableParallelism } from 'node:os';
import { MessageChannel, receiveMessageOnPort, Worker } from 'node:worker_threads';

const WORKER_SOURCE = [
  "const { workerData } = require('node:worker_threads');",
  `import(${JSON.stringify(new URL('tool-worker.mjs', import.meta.url).href)})`,
  '  .then(({ runToolInWorker }) => runToolInWorker(workerData));',
].join('\n');

function startWorker(task, signal) {
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: { url: task.url, name: task.name, options: task.options, port: port2, signal },
    transferList: [port2],
  });
  worker.unref();
  return port1;
}

function outcomeOf(port) {
  const received = receiveMessageOnPort(port);
  port.close();
  return received?.message ?? { error: { message: 'the tool worker stopped without a result' } };
}

function runInWorkers(tasks, { limit, alongside }) {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const ports = [];
  const fill = (finished) => {
    while (ports.length < Math.min(tasks.length, finished + limit)) {
      ports.push(startWorker(tasks[ports.length], signal));
    }
  };
  fill(0);
  alongside();
  for (let finished = Atomics.load(signal, 0); finished < tasks.length;) {
    Atomics.wait(signal, 0, finished);
    finished = Atomics.load(signal, 0);
    fill(finished);
  }
  return ports.map(outcomeOf);
}

export function runToolsConcurrently(tasks, { spawn, alongside, concurrent }) {
  if (!concurrent || spawn !== undefined) {
    for (const task of tasks) task.run({ ...task.options, spawn });
    alongside();
    return;
  }
  const outcomes = runInWorkers(tasks, { limit: Math.max(1, availableParallelism()), alongside });
  const failure = outcomes.map(({ error }) => error).find((error) => error !== undefined);
  if (failure !== undefined) {
    throw Object.assign(new Error(failure.message), failure);
  }
}
