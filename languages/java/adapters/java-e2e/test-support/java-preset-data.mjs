export const LEGACY = `package demo;

public final class Legacy {
  private int leftover;

  public int value() {
    return 1;
  }
}
`;

export const LEGACY_MOVED = LEGACY.replace(
  '  private int leftover;',
  '  // Kept for compatibility.\n  // See ticket 12.\n  private int leftover;',
);

export const FAREWELL = `package demo;

public final class Greeter {
  public String greet(String name) {
    return "Hello, " + name + "!";
  }

  public String shout(String name) {
    return name.trim().toUpperCase(java.util.Locale.ROOT);
  }

  /** Says goodbye. */
  public String farewell(String name) {
    return "Goodbye, " + name + ".";
  }
}
`;

export const GREETER_TEST = `package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class GreeterTest {
  @Test
  void greetsByName() {
    assertEquals("Hello, Ada!", new Greeter().greet("Ada"));
  }

  @Test
  void saysFarewell() {
    assertEquals("Goodbye, Ada.", new Greeter().farewell("Ada"));
  }
}
`;

export const CALC = `package demo;

public final class Calc {
  public int clamp(int value) {
    return value > 10 ? 10 : value;
  }
}
`;

export const CALC_TEST = `package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class CalcTest {
  @Test
  void clampsAboveTen() {
    assertEquals(10, new Calc().clamp(20));
    assertEquals(5, new Calc().clamp(5));
  }
}
`;

export const BAD = `package demo;

public final class Bad {
  public String decode(byte[] bytes) {
    try {
      Integer.parseInt("x");
    } catch (NumberFormatException e) {
    }
    return new String(bytes);
  }
        public void sloppy() { }
}
`;

export const STAMP = `package demo;

import java.util.Date;

public final class Stamp {
  public long now() {
    return new Date().getTime();
  }

  public static final class Inner {
    public long later() {
      return new Date().getTime() + 1;
    }
  }
}
`;

export const BRANCHY = `package demo;

public final class Branchy {
  public int larger(int left, int right) {
    if (left > right) {
      return left;
    }
    return right;
  }
}
`;

export const COMPLEX = `package demo;

public final class Complex {
  private static final int T0 = 0;
  private static final int T1 = 1;
  private static final int T2 = 2;
  private static final int T3 = 3;
  private static final int T4 = 4;
  private static final int T5 = 5;
  private static final int T6 = 6;
  private static final int T7 = 7;
  private static final int T8 = 8;

  public int classify(int value) {
    int result = 0;
    if (value > T0) {
      result += 1;
    }
    if (value > T1) {
      result += 1;
    }
    if (value > T2) {
      result += 1;
    }
    if (value > T3) {
      result += 1;
    }
    if (value > T4) {
      result += 1;
    }
    if (value > T5) {
      result += 1;
    }
    if (value > T6) {
      result += 1;
    }
    if (value > T7) {
      result += 1;
    }
    if (value > T8) {
      result += 1;
    }
    return result;
  }
}
`;

export function clonedClass(name) {
  return `package demo;

public final class ${name} {
  public int total(int a, int b) {
    int total = 0;
${Array.from({ length: 12 }, (_, i) => `    total += (a * ${i + 2}) + (b - ${i});\n    if (total > ${i * 10}) {\n      total -= ${i + 1};\n    }`).join('\n')}
    return total;
  }
}
`;
}

export function stabilityClass(packageName, name, body) {
  return `package ${packageName};

public final class ${name} {
${body}
}
`;
}

export const STABILITY_FILES = {
  'src/main/java/client/ClientOne.java': stabilityClass(
    'client',
    'ClientOne',
    '  public int run() {\n    return new stable.Core().value();\n  }',
  ),
  'src/main/java/client/ClientTwo.java': stabilityClass(
    'client',
    'ClientTwo',
    '  public int run() {\n    return new stable.Core().value() + 1;\n  }',
  ),
  'src/main/java/stable/Core.java': stabilityClass(
    'stable',
    'Core',
    '  public int value() {\n    return new churn.Volatile().value();\n  }',
  ),
  'src/main/java/churn/Volatile.java': stabilityClass(
    'churn',
    'Volatile',
    '  public int value() {\n    return new leaf.Leaf().value();\n  }',
  ),
  'src/main/java/leaf/Leaf.java': stabilityClass(
    'leaf',
    'Leaf',
    '  public int value() {\n    return 1;\n  }',
  ),
};

export const BRANCHY_MOVED = BRANCHY.replace(
  '  public int larger',
  '  // Picks the larger value.\n  public int larger',
);

export const BRANCHY_EDITED = BRANCHY.replace('left > right', 'left >= right');

export const BRANCHY_ADDED = BRANCHY.replace(
  '    return right;\n  }\n',
  `    return right;
  }

  public int smaller(int left, int right) {
    if (left < right) {
      return left;
    }
    return right;
  }
`,
);

export function repeated(count, entry) {
  return Array(count).fill(entry);
}

export const PALANTIR_MESSY = 'package demo;\n\nclass Messy {\n  int a;\n}\n';

export const PALANTIR_ROOMY = `package demo;

public final class Roomy {
    private Roomy() {}

    public static String describe(String firstName, String lastName, String city, String country, int age) {
        return firstName + lastName + city + country + age;
    }
}
`;
