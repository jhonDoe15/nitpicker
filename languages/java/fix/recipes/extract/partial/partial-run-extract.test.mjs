import { describe, expect, it } from 'vitest';
import { applied } from '../test-support/sources.mjs';
import {
  headerMethod,
  headerPair,
  partialClassOf,
  validationMethod,
  validationPair,
} from '../test-support/partial-sources.mjs';
import { javaExtractPartialRunRecipe as recipe } from './partial-run-extract.mjs';

const PATH = 'src/main/java/demo/Align.java';

function plan(text) {
  const { fixes, notes } = recipe.plan({
    files: [{ path: PATH, text }],
    projectRoot: '/nonexistent',
  });
  return { fixes, notes, after: fixes.length === 0 ? text : applied(text, fixes[0].edits) };
}

describe('javaExtractPartialRunRecipe', () => {
  it('is a review recipe for the near-duplicate rule of the Java preset', () => {
    expect([recipe.safety, recipe.scope, recipe.presets, recipe.rules]).toEqual([
      'review',
      'file',
      ['java'],
      [{ tool: 'structure', rule: 'near-duplicate' }],
    ]);
  });

  it('extracts a shared header loop into a static method that returns the value used after it', () => {
    const result = plan(partialClassOf(...headerPair()));
    expect(result.fixes.map(({ finding }) => finding)).toEqual([
      { tool: 'structure', rule: 'near-duplicate', path: PATH, line: 9 },
    ]);
    expect(result.after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.List;
      import java.util.Map;
      import java.util.TreeMap;

      class Align {
          String headerNames(List<String> raw, int limit) {
              List<String> names = sharedHeaderNamesSteps(raw, limit);
              return String.join(",", names);
          }

          private static List<String> sharedHeaderNamesSteps(List<String> raw, int limit) {
              Map<String, String> headers = new TreeMap<>();
              for (String line : raw) {
                  int index = line.indexOf(':');
                  if (index > 0 && headers.size() < limit) {
                      headers.put(line.substring(0, index).trim().toLowerCase(), line.substring(index + 1).trim());
                  }
              }
              List<String> names = new ArrayList<>(headers.keySet());
              return names;
          }

          int headerCount(List<String> raw, int limit) {
              int total = raw.size();
              List<String> names = sharedHeaderNamesSteps(raw, limit);
              return names.size() + total;
          }
      }
      "
    `);
  });

  it('keeps the brackets of an array declared with C-style dimensions', () => {
    const inits = ['new String[1]', 'new String[] {"q", "r"}'];
    const arrayed = headerPair().map((method, index) =>
      method
        .replace('Map<String', `String tags[] = ${inits[index]};\n        Map<String`)
        .replace('< limit', '< limit + tags.length'),
    );
    const { after } = plan(partialClassOf(...arrayed));
    const heads = after.split('\n').filter((line) => line.includes('private static'));
    expect(heads).toEqual([
      '    private static List<String> sharedHeaderNamesSteps(List<String> raw, int limit, String[] tags) {',
    ]);
  });

  it('keeps the line endings of a file that uses CRLF', () => {
    const { fixes, after } = plan(partialClassOf(...headerPair()).replaceAll('\n', '\r\n'));
    expect([fixes.length, after.replaceAll('\r\n', '').includes('\n')]).toEqual([1, false]);
  });

  it('extracts a shared validation prefix and passes the message that differs', () => {
    expect(plan(partialClassOf(...validationPair())).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.List;
      import java.util.Map;
      import java.util.TreeMap;

      class Align {
          String createUser(String name, int age) {
              String trimmed = sharedCreateUserSteps(name, age, "name is required");
              return trimmed + age;
          }

          private static String sharedCreateUserSteps(String name, int age, String value) {
              if (name.isEmpty()) {
                  throw new IllegalArgumentException(value);
              }
              if (age < 0 || age > 150) {
                  throw new IllegalArgumentException("age is out of range");
              }
              if (name.length() > 64) {
                  throw new IllegalArgumentException("name is too long");
              }
              String trimmed = name.trim().toLowerCase();
              return trimmed;
          }

          String renameUser(String name, int age) {
              String trimmed = sharedCreateUserSteps(name, age, "new name is required");
              String label = trimmed + ":" + age;
              return label.toUpperCase();
          }
      }
      "
    `);
  });

  it('extracts a run that defines no value as a statement call', () => {
    const methods = [
      validationMethod('int', 'first', {
        message: 'name is required',
        binds: false,
        after: '        return name.length() + age;',
      }),
      validationMethod('int', 'second', {
        message: 'new name is required',
        binds: false,
        after: '        int total = name.length() * age;\n        return total;',
      }),
    ];
    expect(plan(partialClassOf(...methods)).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.List;
      import java.util.Map;
      import java.util.TreeMap;

      class Align {
          int first(String name, int age) {
              sharedFirstSteps(name, age, "name is required");
              return name.length() + age;
          }

          private static void sharedFirstSteps(String name, int age, String value) {
              if (name.isEmpty()) {
                  throw new IllegalArgumentException(value);
              }
              if (age < 0 || age > 150) {
                  throw new IllegalArgumentException("age is out of range");
              }
              if (name.length() > 64) {
                  throw new IllegalArgumentException("name is too long");
              }
          }

          int second(String name, int age) {
              sharedFirstSteps(name, age, "new name is required");
              int total = name.length() * age;
              return total;
          }
      }
      "
    `);
  });

  it('extracts an instance method when the run reads instance state', () => {
    const source = partialClassOf(
      '    private int floor = 2;\n',
      ...headerPair().map((method) => method.replace('< limit', '< limit + floor')),
    );
    expect(plan(source).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.List;
      import java.util.Map;
      import java.util.TreeMap;

      class Align {
          private int floor = 2;

          String headerNames(List<String> raw, int limit) {
              List<String> names = sharedHeaderNamesSteps(raw, limit);
              return String.join(",", names);
          }

          private List<String> sharedHeaderNamesSteps(List<String> raw, int limit) {
              Map<String, String> headers = new TreeMap<>();
              for (String line : raw) {
                  int index = line.indexOf(':');
                  if (index > 0 && headers.size() < limit + floor) {
                      headers.put(line.substring(0, index).trim().toLowerCase(), line.substring(index + 1).trim());
                  }
              }
              List<String> names = new ArrayList<>(headers.keySet());
              return names;
          }

          int headerCount(List<String> raw, int limit) {
              int total = raw.size();
              List<String> names = sharedHeaderNamesSteps(raw, limit);
              return names.size() + total;
          }
      }
      "
    `);
  });

  it('keeps the name each copy uses for a value the run reads', () => {
    const renamed = headerMethod('int', 'headerCount', {
      before: '        int total = lines.size();',
      after: '        return names.size() + total;',
    }).replaceAll('raw', 'lines');
    const source = partialClassOf(headerPair()[0], renamed);
    expect(plan(source).after).toMatchInlineSnapshot(`
      "package demo;

      import java.util.ArrayList;
      import java.util.List;
      import java.util.Map;
      import java.util.TreeMap;

      class Align {
          String headerNames(List<String> raw, int limit) {
              List<String> names = sharedHeaderNamesSteps(raw, limit);
              return String.join(",", names);
          }

          private static List<String> sharedHeaderNamesSteps(List<String> raw, int limit) {
              Map<String, String> headers = new TreeMap<>();
              for (String line : raw) {
                  int index = line.indexOf(':');
                  if (index > 0 && headers.size() < limit) {
                      headers.put(line.substring(0, index).trim().toLowerCase(), line.substring(index + 1).trim());
                  }
              }
              List<String> names = new ArrayList<>(headers.keySet());
              return names;
          }

          int headerCount(List<String> lines, int limit) {
              int total = lines.size();
              List<String> names = sharedHeaderNamesSteps(lines, limit);
              return names.size() + total;
          }
      }
      "
    `);
  });
});
