import { describe, expect, it } from 'vitest';
import { nullableReturnUses } from './nullable-returns.mts';
import { MARK, flaggedReport, peers, reported, sample } from './test-support/samples.mts';

describe('NullableReturnUse: the Defects4J shapes', () => {
  it('reports a local that stays null on one path and is copied by the caller', () => {
    const { found, marked } = flaggedReport(
      sample(`  Map<String, Integer> initializeHeader(String[] header) {
    Map<String, Integer> hdrMap = null;
    if (header != null) {
      hdrMap = new HashMap<>();
    }
    return hdrMap;
  }
  Map<String, Integer> getHeaderMap() {
    Map<String, Integer> hdr = initializeHeader(null);
    return new LinkedHashMap<String, Integer>(hdr); ${MARK}
  }`),
    );
    expect(found).toEqual(marked);
  });

  it('reports a documented null result passed on to a method that dereferences it', () => {
    const line = `package geometry;
/** A line. */
public class Line {
  /**
   * @param other the other line
   * @return the intersection point, or null if the lines are parallel
   */
  public Point intersection(Line other) {
    return compute(other);
  }
  public Point toSubSpace(Point point) {
    return new Point(point.getX());
  }
}
`;
    const sub = `package geometry;
public class SubLine {
  private Line line;
  public Point intersection(SubLine other) {
    Point v1D = line.intersection(other.line);
    Point sub = line.toSubSpace(v1D);
    return sub;
  }
}
`;
    expect(reported({ 'Line.java': line, 'SubLine.java': sub })).toEqual(['SubLine.java:6']);
  });

  it('reports the unchecked caller when most other callers check the result', () => {
    const text = sample(`  Type getImplicitPrototype() { return prototype; }
  boolean a(Sample s) { return s.getImplicitPrototype() != null; }
  boolean b(Sample s) { Type t = s.getImplicitPrototype(); return t != null && t.ok(); }
  boolean c(Sample s) { Type t = getImplicitPrototype(); if (t == null) { return false; } return t.ok(); }
  boolean d(Sample s) { return s.getImplicitPrototype() == null; }
  Set<String> e(Sample interfaceType) {
    return interfaceType.getImplicitPrototype().getOwnPropertyNames(); ${MARK}
  }`);
    const { found, marked } = flaggedReport(text);
    expect(found).toEqual(marked);
    const [message] = nullableReturnUses([{ file: 'Sample.java', text }]).map((use) => use.message);
    expect(message).toBe(
      [
        '`Sample.getImplicitPrototype` is null-checked by 4 of its 5 callers, and the result',
        'of `Sample.getImplicitPrototype` is dereferenced here without a null check, which can',
        'throw NullPointerException on that path; add `if (result == null) return ...;` or',
        'annotate the method `@Nullable` and handle it. If the caller knows from context that',
        'the value is set, add `Objects.requireNonNull(result, "why")` to document it.',
      ].join(' '),
    );
  });
});

describe('NullableReturnUse: reported uses', () => {
  const callee = `  Object find(String key) {
    if (key.isEmpty()) {
      return null;
    }
    return key;
  }
  boolean checker(String key) { Object value = find(key); return value != null; }
${peers('find')}`;

  it('reports a direct dereference, a local dereference, an index and a for-each', () => {
    const { found, marked } = flaggedReport(
      sample(`${callee}  int a(String key) { return find(key).hashCode(); } ${MARK}
  int b(String key) {
    Object value = find(key);
    return value.hashCode(); ${MARK}
  }
  int c(String key) {
    Object[] value = (Object[]) find(key);
    return 1;
  }
  Object d(String key) {
    List<String> names = names(key);
    for (String name : names) { ${MARK}
      key = name;
    }
    return key;
  }
  List<String> names(String key) {
    if (key.isEmpty()) {
      return null;
    }
    return List.of(key);
  }
  boolean namesChecked(String key) { List<String> n = names(key); return n != null; }`),
    );
    expect(found).toEqual(marked);
  });

  it('reports unboxing of a null Integer and a switch on a null enum', () => {
    const { found, marked } = flaggedReport(
      sample(`  Integer count(String key) {
    if (key.isEmpty()) {
      return null;
    }
    return 1;
  }
  Mode mode(String key) {
    if (key.isEmpty()) {
      return null;
    }
    return Mode.A;
  }
  int a(String key) {
    Integer n = count(key);
    return n + 1; ${MARK}
  }
  int b(String key) {
    int n = count(key); ${MARK}
    return n;
  }
  int c(String key) {
    Mode m = mode(key);
    switch (m) { ${MARK}
      default: return 0;
    }
  }
  boolean checks(String key) { return count(key) != null && mode(key) != null; }
${peers('count')}${peers('mode')}
  enum Mode { A }`),
    );
    expect(found).toEqual(marked);
  });

  it('resolves this.m(), a typed parameter, a typed field and a static call', () => {
    const { found, marked } = flaggedReport(
      sample(`${callee}  Sample other;
  static Object lookup(String key) {
    if (key.isEmpty()) {
      return null;
    }
    return key;
  }
${peers('lookup')}
  int a(String key) { return this.find(key).hashCode(); } ${MARK}
  int b(Sample sample, String key) { return sample.find(key).hashCode(); } ${MARK}
  int c(String key) { return other.find(key).hashCode(); } ${MARK}
  int d(String key) { return Sample.lookup(key).hashCode(); } ${MARK}`),
    );
    expect(found).toEqual(marked);
  });

  it('reports a documented null on the use line, and a use on the next call of a chain', () => {
    const { found, marked } = flaggedReport(
      sample(`  /**
   * Finds the entry.
   * @return the entry, or {@code null} if there is none
   */
  Entry entry(String key) {
    return lookupEntry(key);
  }
  Entry lookupEntry(String key) { return table.get(key); }
${peers('entry')}
  int a(String key) {
    Entry e = entry(key);
    return e ${MARK}
      .size();
  }
  interface Entry { int size(); }`),
    );
    expect(found).toEqual(marked);
  });

  it('reports a documented null used by a single caller that never checks', () => {
    const { found, marked } = flaggedReport(
      sample(`  /**
   * @return the parent, or null if there is none
   */
  Sample parent() { return up; }
  Sample up;
  Sample root() { return parent().parent(); } ${MARK}`),
    );
    expect(found).toEqual(marked);
  });

  it('names the method, where it returns null, the fix and the exception', () => {
    const [message] = nullableReturnUses([
      {
        file: 'Sample.java',
        text: sample(
          `${callee}  int a(String key) { Object value = find(key); return value.hashCode(); }`,
        ),
      },
    ]).map((use) => use.message);
    expect(message).toBe(
      [
        '`Sample.find` returns `null` on line 6 of Sample.java, and other callers check it, and',
        '`value` is dereferenced here without a null check, which can throw NullPointerException',
        'on that path; add `if (value == null) return ...;` or annotate the method `@Nullable`',
        'and handle it. If the caller knows from context that the value is set, add',
        '`Objects.requireNonNull(value, "why")` to document it.',
      ].join(' '),
    );
  });
});

describe('NullableReturnUse: allowed forms', () => {
  const callee = `  Object find(String key) {
    if (key.isEmpty()) {
      return null;
    }
    return key;
  }
  boolean peer(String key) { return find(key) != null; }
`;

  it('allows annotated, stub, null-in-null-out, Optional and flag-dependent methods', () => {
    const { found, marked } = flaggedReport(
      sample(`  @Nullable Object a(String key) { if (key.isEmpty()) { return null; } return key; }
  @CheckForNull Object b(String key) { if (key.isEmpty()) { return null; } return key; }
  Object stub() { return null; }
  Object c(String key) { if (key == null) { return null; } return key.trim(); }
  Object d(String key) { if (key == null || key.isEmpty()) { return null; } return key; }
  Optional<String> e(String key) { return null; }
  Boolean f(String key) { return null; }
  Object g(String key) { System.exit(1); return null; }
  /**
   * @return the entry or null if the flag is false
   */
  Object h(boolean flag) { return flag ? "x" : null; }
  /**
   * @return never null
   */
  Object i(String key) { return null; }
  /**
   * @return the trimmed text, or null if the input is null
   */
  String j(String key) { return key; }
  int use(String key) {
    return a(key).hashCode() + b(key).hashCode() + stub().hashCode() + c(key).hashCode()
      + d(key).hashCode() + e(key).get().length() + h(true).hashCode() + i(key).hashCode()
      + j(key).hashCode();
  }
  Object k(String key) { return () -> { return null; }; }
  int kUse(String key) { return k(key).hashCode(); }`),
    );
    expect(found).toEqual(marked);
  });

  it('allows a local that is assigned on every path or rechecked', () => {
    const { found, marked } = flaggedReport(
      sample(`  Object a(boolean flag) {
    Object result = null;
    if (flag) {
      result = "x";
    } else {
      result = "y";
    }
    return result;
  }
  Object b(boolean flag) {
    Object result = null;
    result = flag ? "x" : "y";
    return result;
  }
  Object c(boolean flag) {
    Object result = null;
    if (flag) {
      result = "x";
    }
    if (result == null) {
      result = "z";
    }
    return result;
  }
  int use(boolean flag) { return a(flag).hashCode() + b(flag).hashCode() + c(flag).hashCode(); }`),
    );
    expect(found).toEqual(marked);
  });

  it('allows a callee that every caller uses without checking', () => {
    const { found, marked } = flaggedReport(
      sample(`${callee.replace('  boolean peer(String key) { return find(key) != null; }\n', '')}
  int a(String key) { return find(key).hashCode(); }
  int b(String key) { return find(key).hashCode(); }
  int c(String key) { return find(key).hashCode(); }`),
    );
    expect(found).toEqual(marked);
  });

  it.each([
    [
      'allows every null check before the use',
      `  int a(String key) { Object v = find(key); if (v == null) { return 0; } return v.hashCode(); }
  int b(String key) { Object v = find(key); return v != null ? v.hashCode() : 0; }
  int c(String key) { Object v = find(key); return Objects.isNull(v) ? 0 : v.hashCode(); }
  int d(String key) { Object v = find(key); Objects.requireNonNull(v, "set"); return v.hashCode(); }
  int e(String key) { Object v = find(key); return v instanceof String ? 1 : v.hashCode(); }
  int f(String key) { Object v = find(key); assert v != null; return v.hashCode(); }
  int g(String key) { Object v = find(key); return Optional.ofNullable(v).map(Object::hashCode).orElse(0); }
  int h(String key) { return find(key) != null ? find(key).hashCode() : 0; }
  int i(String key) { Object v = find(key); v = key; return v.hashCode(); }
  int j(String key) { Object v = find(key); return String.valueOf(v).length() + Objects.hashCode(v); }`,
    ],
    [
      'allows an overload of the same arity that is not nullable',
      `  Object find(Object key) { return key; }
  int a(String key) { return find(key).hashCode(); }`,
    ],
    [
      'allows a method of a library type with the same name',
      `  int a(List<String> list, String key) { return list.find(key).hashCode(); }
  int b(Other other, String key) { return other.find(key).hashCode(); }`,
    ],
    [
      'allows a call inside an anonymous class and a class that is not the callee owner',
      `  Runnable a(String key) {
    return new Runnable() {
      Object find(String other) { return other; }
      public void run() { find("x").hashCode(); }
    };
  }`,
    ],
  ])('%s', (_name, body) => {
    const { found, marked } = flaggedReport(sample(`${callee}${body}`));
    expect(found).toEqual(marked);
  });
});
