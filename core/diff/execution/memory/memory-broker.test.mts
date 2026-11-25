import { afterEach, describe, expect, it } from 'vitest';
import { type MemoryBroker, MEMORY_BROKER_VARIABLE, startMemoryBroker } from './memory-broker.mts';
import { brokerSemaphore, sharedMemoryOf } from './memory-lease.mts';
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
  await Promise.all(brokers.splice(0).map((started) => started.close()));
});

describe('memory broker', () => {
  it('admits leases from several clients against one budget', async () => {
    const address = await broker(1000);
    const first = brokerSemaphore(address);
    const second = brokerSemaphore(address);
    const granted: string[] = [];

    const releaseFirst = await first.acquire(700);
    void second.acquire(600).then((release) => {
      granted.push('second');
      return release;
    });
    await settle();
    expect(granted).toEqual([]);

    releaseFirst();
    await settle();
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
});
