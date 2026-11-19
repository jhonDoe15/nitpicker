import { describe, expect, it } from 'vitest';
import { PYTHON_RECIPES } from '../python-recipes.mts';
import { PATH, extracted, module } from './test-support/extract-sources.mts';
import { methods, reportPair } from './test-support/partial-sources.mts';

describe('python-extract-partial-run', () => {
  it('is a review recipe for structure/near-duplicate in the python preset', () => {
    const recipe = PYTHON_RECIPES.find(({ id }) => id === 'python-extract-partial-run');
    expect([recipe?.safety, recipe?.scope, recipe?.presets, recipe?.rules]).toEqual([
      'review',
      'file',
      ['python'],
      [{ tool: 'structure', rule: 'near-duplicate' }],
    ]);
  });

  it('extracts a shared run into a function that returns the value used after it', () => {
    const { after, fixed } = extracted(module(...reportPair()));
    expect(fixed).toEqual([`${PATH}:1 structure/near-duplicate (python-extract-partial-run)`]);
    expect(after).toMatchInlineSnapshot(`
      "def top(items, limit):
          names = _shared_top_steps(items, limit)
          return ",".join(names)


      def _shared_top_steps(items, limit):
          header = []
          for item in items:
              if len(item) > limit:
                  header.append(item.strip().lower())
          names = sorted(set(header))
          for name in names:
              record(name, limit)
          return names


      def bottom(values, cap):
          count = len(values)
          keys = _shared_top_steps(values, cap)
          return len(keys) + count
      "
    `);
  });

  it('extracts a private method when the copies are methods of one class', () => {
    expect(extracted(methods(...reportPair())).after).toMatchInlineSnapshot(`
      "class Report:
          def top(self, items, limit):
              names = self._shared_top_steps(items, limit)
              return ",".join(names)

          def _shared_top_steps(self, items, limit):
              header = []
              for item in items:
                  if len(item) > limit:
                      header.append(item.strip().lower())
              names = sorted(set(header))
              for name in names:
                  self.record(name, limit)
              return names

          def bottom(self, values, cap):
              count = len(values)
              keys = self._shared_top_steps(values, cap)
              return len(keys) + count
      "
    `);
  });

  it('extracts a run that defines no value as a statement call', () => {
    const quiet = reportPair(
      { after: ['print("done")'] },
      { before: ['count = len(values)'], after: ['print("done")', 'print(count)'] },
    );
    expect(extracted(module(...quiet)).after).toMatchInlineSnapshot(`
      "def top(items, limit):
          _shared_top_steps(items, limit)


      def _shared_top_steps(items, limit):
          header = []
          for item in items:
              if len(item) > limit:
                  header.append(item.strip().lower())
          names = sorted(set(header))
          for name in names:
              record(name, limit)
          print("done")


      def bottom(values, cap):
          count = len(values)
          _shared_top_steps(values, cap)
          print(count)
      "
    `);
  });

  it('returns a value the code after the run only updates', () => {
    const updating = reportPair(
      { after: ['print("a")', 'names += ["x"]'] },
      { after: ['print("a", "b")', 'keys += ["x"]', 'return count'] },
    );
    expect(extracted(module(...updating)).after).toMatchInlineSnapshot(`
      "def top(items, limit):
          names = _shared_top_steps(items, limit)
          print("a")
          names += ["x"]


      def _shared_top_steps(items, limit):
          header = []
          for item in items:
              if len(item) > limit:
                  header.append(item.strip().lower())
          names = sorted(set(header))
          for name in names:
              record(name, limit)
          return names


      def bottom(values, cap):
          count = len(values)
          keys = _shared_top_steps(values, cap)
          print("a", "b")
          keys += ["x"]
          return count
      "
    `);
  });

  it('returns a value the code after the run deletes', () => {
    const deleting = reportPair(
      { after: ['print("a")', 'del names'] },
      { after: ['print("a", "b")', 'del keys', 'return count'] },
    );
    expect(extracted(module(...deleting)).after).toMatchInlineSnapshot(`
      "def top(items, limit):
          names = _shared_top_steps(items, limit)
          print("a")
          del names


      def _shared_top_steps(items, limit):
          header = []
          for item in items:
              if len(item) > limit:
                  header.append(item.strip().lower())
          names = sorted(set(header))
          for name in names:
              record(name, limit)
          return names


      def bottom(values, cap):
          count = len(values)
          keys = _shared_top_steps(values, cap)
          print("a", "b")
          del keys
          return count
      "
    `);
  });

  it('keeps the line endings of a file that uses CRLF', () => {
    const { after } = extracted(module(...reportPair()).replaceAll('\n', '\r\n'));
    expect([
      after.includes('_shared_top_steps'),
      after.replaceAll('\r\n', '').includes('\n'),
    ]).toEqual([true, false]);
  });
});
