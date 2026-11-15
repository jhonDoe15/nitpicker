import { describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mjs';
import { compileStatus, javacAvailable } from '../test-support/javac.mjs';
import { applied } from '../test-support/sources.mjs';
import {
  anonymous,
  floorMethod,
  mapper,
  picker,
  wideClass,
} from '../test-support/wide-sources.mjs';

const PATH = 'src/main/java/demo/Wide.java';

function plan(text) {
  const { fixes, notes } = recipe.plan({
    files: [{ path: PATH, text }],
    projectRoot: '/nonexistent',
  });
  return {
    fixes,
    notes,
    after: applied(
      text,
      fixes.flatMap(({ edits }) => edits),
    ),
  };
}

describe('javaExtractNearDuplicateRecipe with type holes', () => {
  it('turns a differing element type into a type parameter and keeps the callers', () => {
    const source = wideClass(
      picker('top', { element: 'String', tail: 'null' }),
      picker('bottom', { element: 'Integer', tail: 'null' }),
    );
    expect(plan(source).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.HashMap;
      import java.util.List;
      import java.util.Map;

      final class Wide {
          interface Selector {
              List<String> select(List<String> source, int limit);
          }

          List<String> top(List<String> source, int limit) {
              return sharedTop(source, limit);
          }

          private static <T> List<T> sharedTop(List<T> source, int limit) {
              List<T> picked = new ArrayList<T>();
              int seen = 0;
              for (T item : source) {
                  seen++;
                  if (picked.size() < limit) {
                      picked.add(item);
                  }
              }
              if (seen == 0) {
                  picked.clear();
              }
              picked.add(null);
              return picked;
          }

          List<Integer> bottom(List<Integer> source, int limit) {
              return sharedTop(source, limit);
          }
      }
      "
    `);
  });

  it('names one type parameter for each differing pair of types', () => {
    const source = wideClass(
      mapper('names', 'String', 'Runnable'),
      mapper('ratios', 'Thread', 'Throwable'),
    );
    expect(plan(source).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.HashMap;
      import java.util.List;
      import java.util.Map;

      final class Wide {
          interface Selector {
              List<String> select(List<String> source, int limit);
          }

          Map<String, Runnable> names(Map<String, Runnable> source, String fallbackKey, Runnable fallback) {
              return sharedNames(source, fallbackKey, fallback);
          }

          private static <T, U> Map<T, U> sharedNames(Map<T, U> source, T fallbackKey, U fallback) {
              Map<T, U> copy = new HashMap<>();
              int kept = 0;
              for (T name : source.keySet()) {
                  if (kept < 100) {
                      copy.put(name, fallback);
                      kept++;
                  }
              }
              if (copy.isEmpty()) {
                  copy.put(fallbackKey, fallback);
              }
              return copy;
          }

          Map<Thread, Throwable> ratios(Map<Thread, Throwable> source, Thread fallbackKey, Throwable fallback) {
              return sharedNames(source, fallbackKey, fallback);
          }
      }
      "
    `);
  });

  it.skipIf(!javacAvailable())('produces code that compiles', () => {
    const source = wideClass(
      picker('top', { element: 'String', tail: 'null' }),
      picker('bottom', { element: 'Integer', tail: 'null' }),
      mapper('names', 'String', 'Runnable'),
      mapper('ratios', 'Thread', 'Throwable'),
    );
    const { after, fixes } = plan(source);
    expect([fixes.length, compileStatus(after)]).toEqual([2, 0]);
  });
});

describe('javaExtractNearDuplicateRecipe with expressions that differ', () => {
  const members =
    '    private int minimum() { return 2; }\n    private int maximum() { return 9; }\n';

  it('passes a call as a supplier so it runs where it ran before', () => {
    expect(
      plan(wideClass(members, floorMethod('top', 'minimum()'), floorMethod('bottom', 'maximum()')))
        .after,
    ).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.HashMap;
      import java.util.List;
      import java.util.Map;

      final class Wide {
          interface Selector {
              List<String> select(List<String> source, int limit);
          }

          private int minimum() { return 2; }
          private int maximum() { return 9; }

          List<String> top(List<String> xs, int n) {
              return sharedTop(xs, n, () -> minimum());
          }

          private static List<String> sharedTop(List<String> xs, int n, java.util.function.IntSupplier capSupplier) {
              List<String> picked = new ArrayList<>();
              int seen = 0;
              for (String item : xs) {
                  seen++;
                  int cap = capSupplier.getAsInt();
                  if (picked.size() < n + cap) {
                      picked.add(item);
                  }
              }
              String label = String.join(",", picked);
              picked.add(label);
              return picked;
          }

          List<String> bottom(List<String> xs, int n) {
              return sharedTop(xs, n, () -> maximum());
          }
      }
      "
    `);
  });

  it('passes a field read as a supplier too', () => {
    const fields = '    private int floor = 2;\n    private int ceiling = 9;\n';
    const source = wideClass(fields, floorMethod('top', 'floor'), floorMethod('bottom', 'ceiling'));
    expect(plan(source).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.HashMap;
      import java.util.List;
      import java.util.Map;

      final class Wide {
          interface Selector {
              List<String> select(List<String> source, int limit);
          }

          private int floor = 2;
          private int ceiling = 9;

          List<String> top(List<String> xs, int n) {
              return sharedTop(xs, n, () -> floor);
          }

          private static List<String> sharedTop(List<String> xs, int n, java.util.function.IntSupplier capSupplier) {
              List<String> picked = new ArrayList<>();
              int seen = 0;
              for (String item : xs) {
                  seen++;
                  int cap = capSupplier.getAsInt();
                  if (picked.size() < n + cap) {
                      picked.add(item);
                  }
              }
              String label = String.join(",", picked);
              picked.add(label);
              return picked;
          }

          List<String> bottom(List<String> xs, int n) {
              return sharedTop(xs, n, () -> ceiling);
          }
      }
      "
    `);
  });

  it.skipIf(!javacAvailable())('produces code that compiles', () => {
    const { after, fixes } = plan(
      wideClass(members, floorMethod('top', 'minimum()'), floorMethod('bottom', 'maximum()')),
    );
    expect([fixes.length, compileStatus(after)]).toEqual([1, 0]);
  });
});

describe('javaExtractNearDuplicateRecipe with anonymous classes', () => {
  const source = wideClass(anonymous('TOP', '"top"'), anonymous('BOTTOM', '"bottom"'));

  it('extracts a private static method of the enclosing class', () => {
    expect(plan(source).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.HashMap;
      import java.util.List;
      import java.util.Map;

      final class Wide {
          interface Selector {
              List<String> select(List<String> source, int limit);
          }

          static final Selector TOP = new Selector() {
              @Override
              public List<String> select(List<String> source, int limit) {
                  return sharedSelect(source, limit, "top");
              }
          };

          private static List<String> sharedSelect(List<String> source, int limit, String value) {
              List<String> picked = new ArrayList<>();
              for (String item : source) {
                  if (picked.size() < limit) {
                      picked.add(item);
                  }
              }
              picked.add(value);
              return picked;
          }

          static final Selector BOTTOM = new Selector() {
              @Override
              public List<String> select(List<String> source, int limit) {
                  return sharedSelect(source, limit, "bottom");
              }
          };
      }
      "
    `);
  });

  it.skipIf(!javacAvailable())('produces code that compiles', () => {
    const { after, fixes } = plan(source);
    expect([fixes.length, compileStatus(after)]).toEqual([1, 0]);
  });
});
