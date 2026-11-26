package e;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;

class B6Misc {
  int hashes(int i, long l, char c, boolean b, byte by, short s, float f, double d, Integer boxed, Object o, String str) {
    int a = Objects.hashCode(i);
    a += Objects.hashCode(l);
    a += Objects.hashCode(c);
    a += Objects.hashCode(b);
    a += Objects.hashCode(by);
    a += Objects.hashCode(s);
    a += Objects.hashCode(f);
    a += Objects.hashCode(d);
    a += Objects.hashCode(i + 1);
    a += Objects.hashCode(boxed);
    a += Objects.hashCode(o);
    a += Objects.hashCode(str);
    a += Objects.hashCode(null);
    a += Objects.hashCode(3);
    a += Objects.hashCode('x');
    a += Objects.hashCode(true);
    a += Objects.hashCode(2.5);
    a += Objects.hashCode(10L);
    a += Objects.hash(i);
    a += Objects.hash(i, l);
    a += java.util.Objects.hashCode(i);
    a += Objects.hashCode(new int[0]);
    a += Objects.hashCode((Object) i);
    a += Objects.hashCode(Integer.valueOf(i));
    a += Objects.hashCode(i == 1);
    a += Objects.hashCode(str.length());
    a += Objects.hashCode(l * 2);
    return a;
  }

  void assignments(boolean a, boolean b, boolean c, int x, int y) {
    if (a = b) {
    }
    if ((a = b)) {
    }
    while (a = c) {
      break;
    }
    do {
      a = false;
    } while (a = b);
    for (int i = 0; a = b; i++) {
      break;
    }
    for (; (a = b); ) {
      break;
    }
    if (a == b) {
    }
    if (a = b && c) {
    }
    if (!(a = b)) {
    }
    if (a |= b) {
    }
    boolean r = (a = b);
    if (a
        = b) {
    }
    if (a=b) {
    }
  }

  @SuppressWarnings("LogicalAssignment")
  void suppressedAssignment(boolean a, boolean b) {
    if (a = b) {
    }
  }

  void keys() {
    Set<String[]> s1 = new HashSet<String[]>();
    Set<int[]> s2 = new HashSet<>();
    Map<int[], String> m1 = new HashMap<int[], String>();
    Map<String[], Integer> m2 = new HashMap<>();
    Map<byte[][], Integer> m3 = new LinkedHashMap<>();
    Map<char[], Integer> m4 = new ConcurrentHashMap<>();
    Map<String[], Integer> m5 = new TreeMap<>();
    Set<List<String>> s3 = new HashSet<List<String>>();
    Set<String> s4 = new HashSet<>();
    Set<String[]> s5 = new HashSet<String[]>(10);
    Set<String[]> s6 = new HashSet<String[]>() {};
    Set raw = new HashSet();
    Map<String, int[]> m6 = new HashMap<String, int[]>();
    Map<Object[], String> m7 = new HashMap<>(m2.size());
    Object o = new HashSet<long[]>();
    var v = new HashSet<double[]>();
    List<int[]> l = new ArrayList<int[]>();
    Set<? extends String[]> w = new HashSet<String[]>();
  }

  <T> void keysGeneric() {
    Set<T[]> s = new HashSet<T[]>();
    Map<T[], T> m = new HashMap<>();
    Set<T> ok = new HashSet<T>();
  }

  void computes(Map<Integer, List<String>> map, Map<String, Foo> foos, ConcurrentHashMap<String, Bar> bars) {
    map.computeIfAbsent(1, ArrayList::new);
    int key = 2;
    map.computeIfAbsent(key, ArrayList::new);
    foos.computeIfAbsent("a", Foo::new);
    String name = "n";
    foos.computeIfAbsent(name, Foo::new);
    foos.computeIfAbsent(name, x -> new Foo());
    foos.computeIfAbsent(name, x -> new Foo(x));
    bars.computeIfAbsent("a", Bar::new);
    foos.computeIfAbsent(name.trim(), Foo::new);
    foos.computeIfAbsent(String.valueOf(1), Foo::new);
    foos.computeIfPresent("a", (k, v) -> v);
    foos.merge("a", new Foo(), (p, q) -> p);
    map.computeIfAbsent(7, ArrayList<String>::new);
    new HashMap<Integer, List<String>>().computeIfAbsent(3, ArrayList::new);
    Map<Integer, StringBuilder> sbs = new HashMap<>();
    sbs.computeIfAbsent(1, StringBuilder::new);
    Map<Integer, Foo> byFoo = new HashMap<>();
    byFoo.computeIfAbsent(1, B6Misc::make);
  }

  static Foo make(int x) {
    return new Foo();
  }

  static class Foo {
    Foo() {}

    Foo(String name) {}
  }

  static class Bar {
    Bar(String key) {}
  }

  static class StaticBase {
    static int COUNT = 1;
    static final String NAME = "x";
    int instanceField;

    static void util() {}

    void instance() {}

    static StaticBase make() {
      return new StaticBase();
    }
  }

  static class StaticSub extends StaticBase {
    void use(StaticSub other, StaticBase base) {
      int a = this.COUNT;
      int b = other.COUNT;
      int c = base.COUNT;
      this.util();
      other.util();
      base.util();
      util();
      StaticBase.util();
      StaticSub.util();
      StaticSub.COUNT = 3;
      this.instance();
      int d = base.instanceField;
      String n = base.NAME;
      String n2 = this.NAME;
      super.util();
      int e = super.COUNT;
    }
  }

  void outside(StaticBase base, StaticSub sub) {
    int a = base.COUNT;
    base.util();
    sub.util();
    String n = sub.NAME;
    int len = new int[2].length;
    int local = base.COUNT + sub.COUNT;
    Class<?> k = base.getClass();
    new StaticBase().util();
    StaticBase.make().util();
    base.make().COUNT++;
    int fromCall = StaticBase.make().COUNT;
    int fromNew = new StaticBase().COUNT;
    System.out.println(Integer.MAX_VALUE);
    java.lang.System.out.println();
    Runnable r = () -> base.util();
    int COUNT = 5;
    int viaLocal = base.COUNT + COUNT;
  }

  int field = StaticBase.make().COUNT;

  void lambdaClash(StaticBase base) {
    java.util.function.IntUnaryOperator op = COUNT -> base.COUNT + COUNT;
  }

  void colorUse(Color color) {
    Color c = color.RED;
    Color d = Color.RED.GREEN;
    Color e = Color.RED;
    Color f = color.valueOf("RED");
    Color g = Color.valueOf("RED");
    Color[] h = color.values();
  }

  enum Color {
    RED, GREEN;

    Color self() {
      return this.RED;
    }
  }

  interface Konst {
    int LIMIT = 10;

    static void helper() {}
  }

  static class Implements implements Konst {
    int get(Implements other, Konst konst) {
      return other.LIMIT + konst.LIMIT + this.LIMIT;
    }
  }

  @SuppressWarnings("StaticQualifiedUsingExpression")
  int suppressedStatic(StaticBase base) {
    return base.COUNT;
  }

  void outerNested(Nested.Deep deep) {
    int a = deep.DEEP_COUNT;
    deep.deepStatic();
    int b = Nested.Deep.DEEP_COUNT;
  }

  static class Nested {
    static class Deep {
      static int DEEP_COUNT = 1;

      static void deepStatic() {}
    }
  }

  void checkNotNull(String s, int i, Object o, boolean flag) {
    Objects.requireNonNull(new Object());
    Object a = Objects.requireNonNull(new Object());
    Objects.requireNonNull(new int[2]);
    Objects.requireNonNull("literal");
    Objects.requireNonNull("literal", "message");
    Object b = Objects.requireNonNull("literal");
    Objects.requireNonNull(i);
    Objects.requireNonNull(i, "msg");
    int c = Objects.requireNonNull(i);
    Objects.requireNonNull(s);
    Objects.requireNonNull(o, "message");
    Objects.requireNonNull(flag);
    Objects.requireNonNull(s == null);
    Objects.requireNonNull(i == 5);
    Objects.requireNonNull(null == s);
    Objects.requireNonNull(null != s);
    Objects.requireNonNull(i > 2);
    Objects.requireNonNull(!flag);
    Objects.requireNonNull(s.isEmpty());
    Objects.requireNonNull(i + 1);
    Objects.requireNonNull(Integer.valueOf(i));
    Objects.requireNonNull(new ArrayList<String>(), "msg");
    foo(Objects.requireNonNull("x"));
    foo(Objects.requireNonNull(3));
    boolean t = Objects.requireNonNull(true) && flag;
    if (Objects.requireNonNull(i == 2)) {
    }
    Objects.requireNonNull(new String[] {"a"});
    Objects.requireNonNull('c');
    Objects.requireNonNull((Object) "s");
    Objects.requireNonNull(s.length());
  }

  void foo(Object o) {}

  @DoNotCallAlias
  void marker() {}

  @interface DoNotCallAlias {}
}
