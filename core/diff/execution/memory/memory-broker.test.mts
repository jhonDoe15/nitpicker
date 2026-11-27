import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type Ledger,
  type LeaseSocket,
  type MemoryBroker,
  MEMORY_BROKER_VARIABLE,
  leaseRequests,
  startMemoryBroker,
} from './memory-broker.mts';
import { type BrokerSocket, brokerSemaphore, sharedMemoryOf } from './memory-lease.mts';
import { createWeightedSemaphore } from '../capacity.mts';
import { runTaskGraph } from '../graph/task-graph.mts';
import { task } from '../test-support/analyzer-task.mts';
import type { AnalyzerTask } from '../tasks.mts';

const brokers: MemoryBroker[] = [];

async function broker(capacity: number): Promise<string> {
  const started = await startMemoryBroker(capacity);
  brokers.push(started);
  return started.environment[MEMORY_BROKER_VARIABLE] ?? '';
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  const closed = await Promise.allSettled(brokers.splice(0).map((started) => started.close()));
  const failure = closed.find((result) => result.status === 'rejected');
  if (failure !== undefined) {
    throw new Error('A memory broker did not close', { cause: failure.reason });
  }
});

describe('memory broker', () => {
  it('admits leases from several clients against one budget', async () => {
    const address = await broker(1000);
    const first = brokerSemaphore(address);
    const second = brokerSemaphore(address);
    const granted: string[] = [];

    const releaseFirst = await first.acquire(700);
    async function acquireSecond(): Promise<void> {
      await second.acquire(600);
      granted.push('second');
    }
    const secondGranted = acquireSecond();
    await settle();
    expect(granted).toEqual([]);

    releaseFirst();
    await secondGranted;
    expect(granted).toEqual(['second']);
  });

  it('frees the leases of a client whose connection closes', async () => {
    const started = await startMemoryBroker(1000);
    brokers.push(started);
    const address = started.environment[MEMORY_BROKER_VARIABLE] ?? '';
    const lost = brokerSemaphore(address);
    await lost.acquire(1000);
    await started.close();
    brokers.pop();

    const restarted = await broker(1000);
    expect(await brokerSemaphore(restarted).acquire(1000)).toBeTypeOf('function');
    expect(await lost.acquire(500)).toBeTypeOf('function');
  });

  it('grants right away when no broker answers', async () => {
    const missing = brokerSemaphore('/nonexistent/nitpicker-memory.sock');

    expect(await missing.acquire(500)).toBeTypeOf('function');
    expect(sharedMemoryOf({})).toBeUndefined();
  });

  it('keeps two project schedulers within one machine budget', async () => {
    const address = await broker(10_000);
    const running = new Set<string>();
    let most = 0;
    function project(prefix: string): Promise<unknown> {
      const tasks = ['typecheck', 'structure'].map((name) => ({
        ...task(`${prefix}-${name}`),
        memoryMegabytes: 4000,
      }));
      return runTaskGraph(tasks, {
        maxParallel: 4,
        memoryMegabytes: 10_000,
        sharedMemory: brokerSemaphore(address),
        execute: async ({ name }: AnalyzerTask) => {
          running.add(name);
          most = Math.max(most, running.size);
          await settle();
          running.delete(name);
          return { findings: [] };
        },
      });
    }

    await Promise.all([project('atoms'), project('base')]);

    expect(most).toBe(2);
  });

  it('reports a failure when no socket folder can be made', async () => {
    vi.stubEnv('TMPDIR', '/nonexistent/nitpicker-tmp');

    const started = await startMemoryBroker(1000);

    expect(started.environment).toEqual({});
    expect(started.failure).toMatch(
      /^Error: ENOENT: no such file or directory, mkdtemp '\/nonexistent\/nitpicker-tmp\/nitpicker-mb-\w+'$/u,
    );
    await expect(started.close()).resolves.toBeUndefined();
  });

  it('reports a failure when the named pipe cannot listen', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    const started = await startMemoryBroker(1000);

    expect(started.environment).toEqual({});
    expect(started.failure).toMatch(
      /^Error: listen E[A-Z]+: [a-z ]+ \\\\\?\\pipe\/nitpicker-memory-\d+-\d+$/u,
    );
  });

  it('rejects a second close of the same broker', async () => {
    const started = await startMemoryBroker(1000);
    await started.close();

    await expect(started.close()).rejects.toThrow(/not running/u);
  });

  it('ignores messages without an id and releases of unknown leases', async () => {
    const socket = fakeLeaseSocket();
    const requests = leaseRequests(socket, ledger(1000));

    requests.handle('{"acquire":10}');
    requests.handle('{"id":7,"release":true}');
    requests.handle('{"id":8,"acquire":1000}');

    await vi.waitFor(() => {
      expect(socket.sent).toEqual(['{"id":8}\n']);
    });
    requests.close();
  });

  it('drops a lease that is released before the broker grants it', async () => {
    const budget = ledger(1000);
    const releaseHolder = await budget.semaphore.acquire(1000);
    const socket = fakeLeaseSocket();
    const requests = leaseRequests(socket, budget);
    requests.handle('{"id":1,"acquire":500}');
    requests.handle('{"id":1,"release":true}');

    releaseHolder();
    expect(await budget.semaphore.acquire(1000)).toBeTypeOf('function');
    expect(socket.sent).toEqual([]);
  });

  it('frees the grant of a client that left while it waited', async () => {
    const budget = ledger(1000);
    const releaseHolder = await budget.semaphore.acquire(1000);
    const socket = fakeLeaseSocket();
    leaseRequests(socket, budget).handle('{"id":1,"acquire":500}');
    socket.destroyed = true;

    releaseHolder();
    expect(await budget.semaphore.acquire(1000)).toBeTypeOf('function');
    expect(socket.sent).toEqual([]);
  });
});

describe('broker semaphore', () => {
  it('reads the broker address from the environment', () => {
    expect(sharedMemoryOf({ [MEMORY_BROKER_VARIABLE]: '' })).toBeUndefined();
    expect(sharedMemoryOf({ [MEMORY_BROKER_VARIABLE]: '/tmp/broker.sock' })).toHaveProperty(
      'acquire',
    );
  });

  it('skips grants for unknown ids and releases a lease only once', async () => {
    const socket = new FakeBrokerSocket();
    const acquired = brokerSemaphore('/broker', () => socket).acquire(10);
    socket.emit('data', '{"id":99}\n{"other":1}\n{"id":1}\n');
    const release = await acquired;

    release();
    release();

    expect(socket.sent).toEqual([
      'encoding',
      'ref',
      '{"id":1,"acquire":10}\n',
      'unref',
      '{"id":1,"release":true}\n',
    ]);
  });
});

function ledger(capacity: number): Ledger {
  return { semaphore: createWeightedSemaphore(capacity), capacity };
}

function fakeLeaseSocket(): LeaseSocket & { sent: string[]; destroyed: boolean } {
  const sent: string[] = [];
  return {
    sent,
    destroyed: false,
    write: (text: string) => {
      sent.push(text);
      return true;
    },
  };
}

class FakeBrokerSocket extends EventEmitter implements BrokerSocket {
  readonly sent: string[] = [];

  setEncoding(): void {
    this.sent.push('encoding');
  }

  ref(): void {
    this.sent.push('ref');
  }

  unref(): void {
    this.sent.push('unref');
  }

  write(text: string): boolean {
    this.sent.push(text);
    return true;
  }

  destroy(): void {
    this.emit('close');
  }
}
