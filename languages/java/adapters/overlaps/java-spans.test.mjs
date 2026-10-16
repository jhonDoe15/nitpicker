import { describe, expect, it } from 'vitest';
import { javaSpans, lineLocator } from './java-spans.mjs';

const SOURCE = [
  'package demo;',
  '',
  '/** A class { with braces in its Javadoc. */',
  'public class Outer {',
  '  private final Map<String, List<Integer>> counts = new HashMap<>();',
  '  private final Runnable job = () -> {',
  '    run("}");',
  '  };',
  '',
  '  @Override',
  '  public String toString() {',
  "    char brace = '{';",
  '    String block = """',
  '        }',
  '        """;',
  '    return new Object() {',
  '      int x() { return 1; }',
  '    }.toString() + brace + block;',
  '  }',
  '',
  '  static class Inner<T> {',
  '    T value; // }',
  '    Inner(T value) {',
  '      this.value = value;',
  '    }',
  '  }',
  '}',
].join('\n');

describe('javaSpans', () => {
  it('finds classes and members, skipping braces in comments, strings, characters and text blocks', () => {
    expect(javaSpans(SOURCE)).toStrictEqual([
      { kind: 'member', name: 'Outer#job@6', start: 6, end: 8 },
      { kind: 'member', name: 'Outer#toString@10', start: 10, end: 19 },
      { kind: 'member', name: 'Outer$Inner#Inner@23', start: 23, end: 25 },
      { kind: 'class', name: 'Outer$Inner', start: 21, end: 26 },
      { kind: 'class', name: 'Outer', start: 4, end: 27 },
    ]);
  });
});

describe('lineLocator', () => {
  it('names the class, member and declared field at a line', () => {
    const at = lineLocator(SOURCE);

    expect([5, 7, 17, 22].map((line) => at(line))).toStrictEqual([
      { className: 'Outer', member: undefined, field: 'counts' },
      { className: 'Outer', member: 'Outer#job@6', field: undefined },
      { className: 'Outer', member: 'Outer#toString@10', field: undefined },
      { className: 'Outer$Inner', member: undefined, field: 'value' },
    ]);
  });
});
