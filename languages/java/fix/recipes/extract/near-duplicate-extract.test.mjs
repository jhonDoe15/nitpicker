import { describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from './near-duplicate-extract.mjs';
import { applied, classOf, method } from './test-support/sources.mjs';

const PATH = 'src/main/java/demo/Align.java';

function plan(text, path = PATH) {
  const { fixes, notes } = recipe.plan({ files: [{ path, text }], projectRoot: '/nonexistent' });
  return { fixes, notes, after: fixes.length === 0 ? text : applied(text, fixes[0].edits) };
}

const PAIR = [method('top'), method('bottom', { prefix: 'bottom:' })];

describe('javaExtractNearDuplicateRecipe', () => {
  it('is a review recipe for the near-duplicate rule of the Java preset', () => {
    expect([recipe.safety, recipe.scope, recipe.presets, recipe.rules]).toEqual([
      'review',
      'file',
      ['java'],
      [{ tool: 'structure', rule: 'near-duplicate' }],
    ]);
  });

  it('extracts a private static method after the first copy when no instance state is used', () => {
    const result = plan(classOf(...PAIR));
    expect(result.fixes.map(({ finding }) => finding)).toEqual([
      { tool: 'structure', rule: 'near-duplicate', path: PATH, line: 7 },
    ]);
    expect(result.after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.List;

      class Align {
          String top(List<String> selection, int limit) {
              return sharedTop(selection, limit, "top:");
          }

          private static String sharedTop(List<String> selection, int limit, String value) {
              List<String> selected = new ArrayList<>();
              for (String element : selection) {
                  if (element.length() < limit) {
                      selected.add(element);
                  }
              }
              String label = String.join(",", selected);
              return (label.length() > 0 ? value : "none:") + label;
          }

          String bottom(List<String> selection, int limit) {
              return sharedTop(selection, limit, "bottom:");
          }
      }
      "
    `);
  });

  it('keeps the line endings of a file that uses CRLF', () => {
    const { fixes, after } = plan(classOf(...PAIR).replaceAll('\n', '\r\n'));
    expect([fixes.length, after.replaceAll('\r\n', '').includes('\n')]).toEqual([1, false]);
  });

  it('extracts an instance method when the copies read instance state', () => {
    const source = classOf(
      '    private int floor = 2;\n',
      ...PAIR.map((copy) => copy.replace('< limit', '< limit + floor')),
    );
    expect(plan(source).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.List;

      class Align {
          private int floor = 2;

          String top(List<String> selection, int limit) {
              return sharedTop(selection, limit, "top:");
          }

          private String sharedTop(List<String> selection, int limit, String value) {
              List<String> selected = new ArrayList<>();
              for (String element : selection) {
                  if (element.length() < limit + floor) {
                      selected.add(element);
                  }
              }
              String label = String.join(",", selected);
              return (label.length() > 0 ? value : "none:") + label;
          }

          String bottom(List<String> selection, int limit) {
              return sharedTop(selection, limit, "bottom:");
          }
      }
      "
    `);
  });

  it('keeps a throws clause and the statement call of a void method', () => {
    const voids = PAIR.map((copy) =>
      copy
        .replace('String ', 'void ')
        .replace(
          '(List<String> selection, int limit) {',
          '(List<String> selection, int limit) throws java.io.IOException {',
        )
        .replace(/return (.*);/u, 'System.out.println($1);'),
    );
    expect(plan(classOf(...voids)).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.List;

      class Align {
          void top(List<String> selection, int limit) throws java.io.IOException {
              sharedTop(selection, limit, "top:");
          }

          private static void sharedTop(List<String> selection, int limit, String value) throws java.io.IOException {
              List<String> selected = new ArrayList<>();
              for (String element : selection) {
                  if (element.length() < limit) {
                      selected.add(element);
                  }
              }
              String label = String.join(",", selected);
              System.out.println((label.length() > 0 ? value : "none:") + label);
          }

          void bottom(List<String> selection, int limit) throws java.io.IOException {
              sharedTop(selection, limit, "bottom:");
          }
      }
      "
    `);
  });

  it('extracts copies that differ only in the names of locals', () => {
    const renamed = method('bottom').replaceAll('selected', 'chosen').replaceAll('label', 'text');
    expect(plan(classOf(method('top'), renamed)).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.List;

      class Align {
          String top(List<String> selection, int limit) {
              return sharedTop(selection, limit);
          }

          private static String sharedTop(List<String> selection, int limit) {
              List<String> selected = new ArrayList<>();
              for (String element : selection) {
                  if (element.length() < limit) {
                      selected.add(element);
                  }
              }
              String label = String.join(",", selected);
              return (label.length() > 0 ? "top:" : "none:") + label;
          }

          String bottom(List<String> selection, int limit) {
              return sharedTop(selection, limit);
          }
      }
      "
    `);
  });

  it('passes a parameter and a literal as the same hole', () => {
    const limits = [method('top'), method('bottom', { limit: '10' })];
    expect(plan(classOf(...limits)).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.List;

      class Align {
          String top(List<String> selection, int limit) {
              return sharedTop(selection, limit, limit);
          }

          private static String sharedTop(List<String> selection, int limit, int limitValue) {
              List<String> selected = new ArrayList<>();
              for (String element : selection) {
                  if (element.length() < limitValue) {
                      selected.add(element);
                  }
              }
              String label = String.join(",", selected);
              return (label.length() > 0 ? "top:" : "none:") + label;
          }

          String bottom(List<String> selection, int limit) {
              return sharedTop(selection, limit, 10);
          }
      }
      "
    `);
  });

  it('extracts an instance method in a generic class', () => {
    const source = classOf(...PAIR).replace('class Align {', 'class Align<T> {');
    expect(plan(source).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.List;

      class Align<T> {
          String top(List<String> selection, int limit) {
              return sharedTop(selection, limit, "top:");
          }

          private String sharedTop(List<String> selection, int limit, String value) {
              List<String> selected = new ArrayList<>();
              for (String element : selection) {
                  if (element.length() < limit) {
                      selected.add(element);
                  }
              }
              String label = String.join(",", selected);
              return (label.length() > 0 ? value : "none:") + label;
          }

          String bottom(List<String> selection, int limit) {
              return sharedTop(selection, limit, "bottom:");
          }
      }
      "
    `);
  });
});
