import { describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mts';
import { applied } from '../test-support/sources.mjs';
import { compileStatus, javacAvailable } from '../test-support/javac.mjs';

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

function reasons({ notes }) {
  return notes.map((line) => line.split(': ').at(-1));
}

function classOf(...members) {
  return `package demo;

import java.io.IOException;
import java.io.Reader;
import java.util.ArrayList;
import java.util.List;

final class Wide {
    int minimum() {
        return 2;
    }

    int maximum() {
        return 9;
    }

    static int ga(int value) { return value + 1; }
    static int gb(int value) { return value + 2; }

${members.join('\n')}}
`;
}

function guarded(name, call) {
  return `    List<String> ${name}(Reader r, List<String> source, int limit) {
        List<String> picked = new ArrayList<>();
        int seen = 0;
        for (String item : source) {
            seen++;
            try {
                int cap = ${call};
                if (picked.size() < limit + cap) {
                    picked.add(item);
                }
            } catch (IOException e) {
                seen--;
            }
        }
        if (seen == 0) {
            picked.clear();
        }
        return picked;
    }
`;
}

function declared(name, call) {
  return `    List<String> ${name}(List<String> source, int limit) {
        List<String> picked = new ArrayList<>();
        int seen = 0;
        for (String item : source) {
            seen++;
            int cap = ${call};
            if (picked.size() < limit + cap) {
                picked.add(item);
            }
        }
        long total = ${call};
        picked.add(String.valueOf(total));
        return picked;
    }
`;
}

function nested(name, call) {
  return `    List<String> ${name}(List<String> source, int limit) {
        List<String> picked = new ArrayList<>();
        int seen = 0;
        for (String item : source) {
            seen++;
            Object o = new Object() {
                int f() { return ${call}; }
            };
            if (picked.size() < limit + o.hashCode()) {
                picked.add(item);
            }
        }
        if (seen == 0) {
            picked.clear();
        }
        return picked;
    }
`;
}

describe('deferred holes and the compiler', () => {
  it('declines a hole inside a try block with a catch clause', () => {
    const result = plan(
      classOf(guarded('top', 'r.read()'), guarded('bottom', 'r.skip(1) > 0 ? 1 : 0')),
    );
    expect([result.fixes, reasons(result)]).toEqual([
      [],
      ['the copies differ in code that is not a plain value'],
    ]);
  });

  it('declines a return that belongs to an anonymous class', () => {
    const result = plan(classOf(nested('top', 'minimum()'), nested('bottom', 'maximum()')));
    expect([result.fixes, reasons(result)]).toEqual([
      [],
      ['the copies differ in code that is not a plain value'],
    ]);
  });

  it.skipIf(!javacAvailable())('keeps the declared type of each use of one expression', () => {
    const source = classOf(declared('top', 'minimum()'), declared('bottom', 'maximum()'));
    const result = plan(source);
    expect([result.fixes.length, compileStatus(result.after)]).toEqual([1, 0]);
  });
});

describe('anonymous classes and their surroundings', () => {
  function anonymous(name, tail) {
    return `            Selector ${name} = new Selector() {
                public List<String> select(List<String> source, int limit) {
                    List<String> picked = new ArrayList<>();
                    int seen = 0;
                    for (String item : source) {
                        seen++;
                        if (picked.size() < limit) {
                            picked.add(item);
                        }
                    }
                    if (seen == 0) {
                        picked.clear();
                    }
                    picked.add(${tail});
                    return picked;
                }
            };
`;
  }

  it.each([
    ['static <E> List<Selector> make(E marker)'],
    ['static List<Selector> make(String marker)'],
  ])('does not see anonymous classes declared inside a method: %s', (header) => {
    const selector =
      '    interface Selector { List<String> select(List<String> source, int limit); }\n';
    const method = `    ${header} {
${anonymous('top', '"top"')}${anonymous('bottom', '"bottom"')}        return List.of(top, bottom);
    }
`;
    const result = plan(classOf(selector, method));
    expect([result.fixes, result.notes]).toEqual([[], []]);
  });
});
