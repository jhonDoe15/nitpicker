import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ingestCrap } from '../../ingest/crap.mjs';

const METRICS_SOURCE = path.resolve(import.meta.dirname, '../../gradle/StructureMetrics.java');
const SOURCE_ROOT = 'src/main/java';
const EMPTY_JACOCO = '<report name="empty"></report>';

const CONSTRUCTS = `package demo;

import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

public class Constructs {
  private int field;

  static int oldCases(int x) {
    switch (x) {
      case 1:
      case 2:
        return 1;
      default:
        return 0;
    }
  }

  static int arrowCases(int x) {
    return switch (x) {
      case 1 -> 10;
      case 2 -> 20;
      default -> 0;
    };
  }

  static int severalConstants(int x) {
    return switch (x) {
      case 1, 2, 3 -> 10;
      default -> 0;
    };
  }

  static int nullAndDefault(Object o) {
    return switch (o) {
      case Integer i -> 1;
      case null, default -> 0;
    };
  }

  static int guarded(Object o) {
    return switch (o) {
      case String s when s.length() > 1 && !s.isBlank() || s.isEmpty() -> 1;
      default -> 0;
    };
  }

  enum Code { A, B, C, D }

  sealed interface Shape permits Round, Flat {}

  record Round(double r) implements Shape {}

  record Flat(double w) implements Shape {}

  static String flatEnum(Code code) {
    return switch (code) {
      case A -> "a";
      case B -> "b";
      case C -> "c";
      case D -> "d";
    };
  }

  static String blockArms(Code code) {
    return switch (code) {
      case A -> {
        yield "a";
      }
      case B -> "b";
      default -> "c";
    };
  }

  static double sealedGuards(Shape shape) {
    return switch (shape) {
      case Round r when r.r() > 0 -> r.r();
      case Round r -> 0;
      case Flat f -> f.w();
    };
  }

  static void patternStatement(Shape shape) {
    switch (shape) {
      case Round r -> System.out.println(r);
      case Flat f -> System.out.println(f);
    }
  }

  static void arrowStatement(Code code) {
    switch (code) {
      case A -> System.out.println("a");
      case B -> System.out.println("b");
      default -> System.out.println("c");
    }
  }

  static int elseIf(int n) {
    if (n == 1) {
      return 1;
    } else if (n == 2) {
      return 2;
    } else if (n == 3) {
      if (n > 2) {
        return 3;
      }
      return 4;
    } else {
      return 5;
    }
  }

  static int ternary(int a) {
    return a > 0 ? 1 : 2;
  }

  static void lambda(List<Integer> list) {
    list.forEach(i -> {
      if (i > 0) {
        System.out.println(i);
      }
    });
  }

  static Supplier<Integer> anonymous(boolean flag) {
    return new Supplier<Integer>() {
      @Override
      public Integer get() {
        return flag ? 1 : 2;
      }
    };
  }

  static void multiCatch() {
    try {
      Integer.parseInt("1");
    } catch (IllegalStateException | NumberFormatException e) {
      System.out.println(e);
    }
  }

  static int enhancedFor(List<Integer> list) {
    int sum = 0;
    for (int i : list) {
      sum += i;
    }
    return sum;
  }

  static int doWhile(int n) {
    do {
      n--;
    } while (n > 0);
    return n;
  }

  static class Empty {
    private Empty() {}
  }

  static class WithSuper {
    private WithSuper() {
      super();
    }
  }

  static class WithBody {
    private int value;

    private WithBody() {
      if (Math.random() > 1) {
        value = 1;
      }
    }
  }

  static class OpenEmpty {
    OpenEmpty() {}
  }

  static class WithParameter {
    private WithParameter(int x) {}
  }

  static class Wide {
    <K, V> Wide(Map<String, List<Integer>> a, int[] b, String... c) {}

    <K, V> Wide(java.util.Map.Entry<K, V> entry) {}
  }
}
`;

const temporaryRoots = [];
let measured;

function projectWith(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-structure-')));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function measure(root) {
  const output = path.join(root, 'structure.json');
  const result = spawnSync('java', [METRICS_SOURCE, output, root, SOURCE_ROOT], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const stderr = result.stderr
    .split('\n')
    .filter((line) => !line.startsWith('Picked up '))
    .join('\n');
  return { status: result.status, stderr, output };
}

function summary(entries) {
  return Object.fromEntries(
    entries.map((entry) => [
      entry.signature,
      entry.privateEmptyConstructor === true
        ? { complexity: entry.complexity, privateEmptyConstructor: true }
        : { complexity: entry.complexity },
    ]),
  );
}

beforeAll(() => {
  const root = projectWith({ [`${SOURCE_ROOT}/demo/Constructs.java`]: CONSTRUCTS });
  const result = measure(root);
  measured = {
    status: result.status,
    stderr: result.stderr,
    structure: JSON.parse(readFileSync(result.output, 'utf8')),
  };
});

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('StructureMetrics.java', () => {
  it('parses clean sources silently', () => {
    expect({ status: measured.status, stderr: measured.stderr }).toEqual({ status: 0, stderr: '' });
  });

  it('counts complexity and names the signature of every method and constructor', () => {
    expect(summary(measured.structure)).toEqual({
      'Constructs.oldCases(int)': { complexity: 3 },
      'Constructs.arrowCases(int)': { complexity: 2 },
      'Constructs.severalConstants(int)': { complexity: 2 },
      'Constructs.nullAndDefault(Object)': { complexity: 2 },
      'Constructs.guarded(Object)': { complexity: 4 },
      'Constructs.flatEnum(Code)': { complexity: 2 },
      'Constructs.blockArms(Code)': { complexity: 3 },
      'Constructs.sealedGuards(Shape)': { complexity: 3 },
      'Constructs.patternStatement(Shape)': { complexity: 2 },
      'Constructs.arrowStatement(Code)': { complexity: 3 },
      'Constructs.elseIf(int)': { complexity: 5 },
      'Constructs.ternary(int)': { complexity: 2 },
      'Constructs.lambda(List<Integer>)': { complexity: 2 },
      'Constructs.anonymous(boolean)': { complexity: 1 },
      'Constructs.<anonymous>.get()': { complexity: 2 },
      'Constructs.multiCatch()': { complexity: 2 },
      'Constructs.enhancedFor(List<Integer>)': { complexity: 2 },
      'Constructs.doWhile(int)': { complexity: 2 },
      'Constructs.Empty.Empty()': { complexity: 1, privateEmptyConstructor: true },
      'Constructs.WithSuper.WithSuper()': { complexity: 1, privateEmptyConstructor: true },
      'Constructs.WithBody.WithBody()': { complexity: 2 },
      'Constructs.OpenEmpty.OpenEmpty()': { complexity: 1 },
      'Constructs.WithParameter.WithParameter(int)': { complexity: 1 },
      'Constructs.Wide.Wide(Map<String, List<Integer>>, int[], String[])': { complexity: 1 },
      'Constructs.Wide.Wide(java.util.Map.Entry<K, V>)': { complexity: 1 },
    });
  });

  it('keeps an else if on the nesting level of the if it continues', () => {
    const nesting = Object.fromEntries(
      measured.structure.map((entry) => [entry.signature, entry.maxControlNesting]),
    );

    expect(nesting['Constructs.elseIf(int)']).toBe(2);
    expect(nesting['Constructs.guarded(Object)']).toBe(1);
  });

  it('lists the erased parameter types, arrays as Name[], for joining constructors to JaCoCo', () => {
    const types = Object.fromEntries(
      measured.structure.map((entry) => [entry.signature, entry.parameterTypes]),
    );

    expect(types['Constructs.lambda(List<Integer>)']).toEqual(['List']);
    expect(types['Constructs.Wide.Wide(Map<String, List<Integer>>, int[], String[])']).toEqual([
      'Map',
      'int[]',
      'String[]',
    ]);
    expect(types['Constructs.Wide.Wide(java.util.Map.Entry<K, V>)']).toEqual(['Entry']);
  });

  it('reads as the CRAP input, which leaves out the private empty constructors', () => {
    const { findings } = ingestCrap(measured.structure, EMPTY_JACOCO, {
      sourceRoots: [SOURCE_ROOT],
    });

    expect(findings.map((finding) => finding.symbol)).toEqual(
      measured.structure
        .filter((entry) => entry.privateEmptyConstructor !== true)
        .map((entry) => entry.signature),
    );
  });

  it('fails with the file, line and message of a syntax error and writes no report', () => {
    const root = projectWith({
      [`${SOURCE_ROOT}/demo/Fine.java`]: 'package demo;\n\nclass Fine {\n  void ok() {}\n}\n',
      [`${SOURCE_ROOT}/demo/Broken.java`]:
        'package demo;\n\nclass Broken {\n  void a() {\n    int x = ;\n  }\n}\n',
    });

    const result = measure(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      [
        'StructureMetrics could not parse the sources:',
        'src/main/java/demo/Broken.java:5: illegal start of expression',
        '',
      ].join('\n'),
    );
    expect(existsSync(result.output)).toBe(false);
  });
});
