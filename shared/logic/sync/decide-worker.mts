import { MessagePort, parentPort, workerData } from 'node:worker_threads';
import { decide } from '../decide.mjs';

type DecideArguments = Parameters<typeof decide>;

type DecisionRequest = {
  readonly id: number;
  readonly conditions: DecideArguments[0];
  readonly query: DecideArguments[1];
  readonly options: DecideArguments[2];
};

type DecisionChannels = {
  readonly signal: Int32Array;
  readonly replies: MessagePort;
};

async function answer(
  { id, conditions, query, options }: DecisionRequest,
  { signal, replies }: DecisionChannels,
): Promise<void> {
  try {
    replies.postMessage({ id, result: await decide(conditions, query, options) });
  } catch (error) {
    replies.postMessage({ id, result: 'open', failure: String(error) });
  } finally {
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);
  }
}

async function drain(queue: DecisionRequest[], channels: DecisionChannels): Promise<void> {
  try {
    for (const request of queue) {
      await answer(request, channels);
    }
  } catch (error) {
    channels.replies.postMessage({ id: 0, result: 'open', failure: String(error) });
  } finally {
    queue.length = 0;
  }
}

export function serveDecisions(port: MessagePort, channels: DecisionChannels): void {
  const queue: DecisionRequest[] = [];
  port.on('message', (request: DecisionRequest) => {
    queue.push(request);
    if (queue.length === 1) {
      void drain(queue, channels);
    }
  });
}

function isDecisionChannels(value: unknown): value is DecisionChannels {
  return (
    typeof value === 'object' &&
    value !== null &&
    'signal' in value &&
    value.signal instanceof Int32Array &&
    'replies' in value &&
    value.replies instanceof MessagePort
  );
}

const channels: unknown = workerData;
if (parentPort === null || !isDecisionChannels(channels)) {
  throw new Error('decide-worker runs only as the solver worker that decideSync starts');
}
serveDecisions(parentPort, channels);
