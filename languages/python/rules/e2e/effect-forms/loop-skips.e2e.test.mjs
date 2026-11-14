import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: ['swallowed-exception', 'retry-without-idempotency'],
});
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;

describe.skipIf(!enabled)('io-in-loop skips for chunks and paging', () => {
  it('leaves a chunk pulled by a walrus, a flush at a size and a paging for loop alone', () => {
    const [actual, expected] = outcomes([
      [
        'a walrus loop that pulls slices',
        code(
          'import itertools',
          '',
          '',
          'def f(repo, iterator):',
          '    while chunk := list(itertools.islice(iterator, 100)):',
          '        repo.save_many(chunk)',
        ),
        [],
      ],
      [
        'a loop that flushes at a size',
        code(
          'def f(repo, items, size):',
          '    batch = []',
          '    for item in items:',
          '        batch.append(item)',
          '        if len(batch) >= size:',
          '            repo.save_many(batch)',
          '            batch = []',
          '    if batch:',
          '        repo.save_many(batch)',
        ),
        [],
      ],
      [
        'a paging for loop over a counter',
        code(
          'import itertools',
          '',
          '',
          'def f(repo):',
          '    for page in itertools.count(1):',
          '        rows = repo.find_page(page)',
          '        if not rows:',
          '            break',
        ),
        [],
      ],
      [
        'an offset loop with a step',
        code(
          'def f(repo, total, size):',
          '    for start in range(0, total, size):',
          '        repo.find_page(start)',
        ),
        [],
      ],
      [
        'a chunked pair target',
        code(
          'import itertools',
          '',
          '',
          'def f(repo, ids):',
          '    for number, part in enumerate(itertools.batched(ids, 10)):',
          '        repo.save_many(part)',
          '    for left, group in zip(ids, itertools.batched(ids, 10)):',
          '        repo.save_many(group)',
        ),
        [],
      ],
      [
        'a chunk loop whose items are saved one by one',
        code(
          'def f(repo, items):',
          '    batch = []',
          '    for item in items:',
          '        repo.save(item)',
          '        batch.append(item)',
        ),
        ['io-in-loop:4 repo.save()|database'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
