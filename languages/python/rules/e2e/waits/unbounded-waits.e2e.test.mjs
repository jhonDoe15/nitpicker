import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes: allOutcomes } = createScripts();
afterEach(cleanup);

const RULE = 'unbounded-wait';

function outcomes(rows) {
  const [actual, expected] = allOutcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [name, found.filter((f) => f.startsWith(RULE))]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('unbounded-wait', () => {
  it('reports a future waited without a timeout and passes one with a timeout', () => {
    const [actual, expected] = outcomes([
      [
        'result and exception on a submitted future, a Future and a thread-safe coroutine',
        'import asyncio\nimport concurrent.futures\nfrom concurrent.futures import Future, ThreadPoolExecutor\n\n\ndef run(work, coro, loop):\n    with ThreadPoolExecutor() as pool:\n        job = pool.submit(work)\n        job.result()\n        job.exception(timeout=None)\n    pending = Future()\n    pending.result()\n    asyncio.run_coroutine_threadsafe(coro, loop).result()\n    return concurrent.futures.ThreadPoolExecutor().submit(work).result()\n',
        [
          `${RULE}:9 Future.result`,
          `${RULE}:10 Future.exception`,
          `${RULE}:12 Future.result`,
          `${RULE}:13 Future.result`,
          `${RULE}:14 Future.result`,
        ],
      ],
      [
        'the same waits with a timeout, positional or keyword',
        'import asyncio\nfrom concurrent.futures import Future, ThreadPoolExecutor\n\n\ndef run(work, coro, loop):\n    with ThreadPoolExecutor() as pool:\n        job = pool.submit(work)\n        job.result(30)\n        job.exception(timeout=30)\n    pending = Future()\n    pending.result(timeout=5)\n    return asyncio.run_coroutine_threadsafe(coro, loop).result(10)\n',
        [],
      ],
      [
        'asyncio futures and receivers of unknown type are not blocking waits',
        'import asyncio\n\n\nasync def run(loop, other, items):\n    done = loop.create_future()\n    await done\n    asyncio.Future().result()\n    other.result()\n    return [item.result() for item in items]\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('follows futures held in lists, attributes, parameters and aliases', () => {
    const [actual, expected] = outcomes([
      [
        'a loop over submitted futures, an attribute, an annotated parameter and an alias',
        'import concurrent.futures as cf\n\n\nclass Runner:\n    def __init__(self):\n        self.job = cf.Future()\n\n    def finish(self):\n        return self.job.result()\n\n\ndef gather(pool, items):\n    jobs = [pool.submit(print, item) for item in items]\n    return jobs\n\n\ndef collect(items):\n    pool = cf.ThreadPoolExecutor()\n    jobs = [pool.submit(print, item) for item in items]\n    for job in jobs:\n        job.result()\n\n\ndef take(job: cf.Future[int]):\n    return job.result()\n',
        [`${RULE}:9 Future.result`, `${RULE}:21 Future.result`, `${RULE}:25 Future.result`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reports wait and as_completed without a timeout', () => {
    const [actual, expected] = outcomes([
      [
        'wait and as_completed without and with a timeout',
        'import concurrent.futures\nfrom concurrent.futures import as_completed, wait\n\n\ndef run(jobs):\n    wait(jobs)\n    wait(jobs, timeout=30)\n    wait(jobs, None)\n    for job in as_completed(jobs):\n        print(job)\n    for job in concurrent.futures.as_completed(jobs, timeout=30):\n        print(job)\n    concurrent.futures.wait(jobs, return_when=concurrent.futures.FIRST_COMPLETED)\n',
        [
          `${RULE}:6 concurrent.futures.wait`,
          `${RULE}:8 concurrent.futures.wait`,
          `${RULE}:9 concurrent.futures.as_completed`,
          `${RULE}:13 concurrent.futures.wait`,
        ],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reports a thread joined without a timeout, subclasses included', () => {
    const [actual, expected] = outcomes([
      [
        'join on a started thread, a timer and a Thread subclass',
        'import threading\n\n\nclass Worker(threading.Thread):\n    pass\n\n\ndef run(target):\n    thread = threading.Thread(target=target)\n    thread.start()\n    thread.join()\n    threading.Timer(5, target).join()\n    Worker().join()\n    thread.join(timeout=None)\n',
        [
          `${RULE}:11 Thread.join`,
          `${RULE}:12 Thread.join`,
          `${RULE}:13 Thread.join`,
          `${RULE}:14 Thread.join`,
        ],
      ],
      [
        'join with a timeout, string join and unknown receivers',
        'import threading\n\n\ndef run(target, other, parts, **options):\n    thread = threading.Thread(target=target)\n    thread.join(5)\n    thread.join(timeout=5)\n    thread.join(**options)\n    other.join()\n    return ", ".join(parts)\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('follows optional and string annotations and joins a process', () => {
    const [actual, expected] = outcomes([
      [
        'annotated parameters and a multiprocessing process',
        'import multiprocessing\nimport threading\nfrom typing import Optional\n\n\ndef stop(worker: Optional[threading.Thread], other: "threading.Thread | None"):\n    worker.join()\n    other.join()\n\n\ndef run(target):\n    child = multiprocessing.Process(target=target)\n    child.join()\n    child.join(timeout=5)\n',
        [`${RULE}:7 Thread.join`, `${RULE}:8 Thread.join`, `${RULE}:13 Thread.join`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves tests out', () => {
    const [actual, expected] = outcomes([
      [
        'a test that joins a thread',
        {
          file: 'tests/test_worker.py',
          code: 'import threading\n\n\ndef test_worker():\n    thread = threading.Thread(target=print)\n    thread.join()\n',
        },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
