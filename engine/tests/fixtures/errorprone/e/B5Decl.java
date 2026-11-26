package e;

import static java.util.Objects.requireNonNull;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

class B5Decl {
  /** @deprecated use something else */
  void oldMethod() {}

  /**
   * Text.
   *
   * @deprecated use something else
   */
  public int oldField;

  /** @deprecated */
  @Deprecated
  void annotated() {}

  /** Not deprecated, mentions @deprecated inline. */
  void mention() {}

  /**
   * @deprecated old
   */
  static class Old {}

  /** @deprecated first */
  int first, second;

  /** @deprecatedness */
  void notATag() {}

  /** @deprecated */
  enum Choice {
    /** @deprecated */
    A,
    B
  }

  /** @deprecated */
  @SuppressWarnings("x")
  public void withOther() {}

  /** @deprecated */
  <T> void generic() {}

  void locals() {
    /** @deprecated */
    int local = 1;
  }

  double d1 = 0.1;
  double d2 = 1.23456789012345678;
  float f1 = 0.1f;
  float f2 = 1.23456789f;
  float f3 = 16777217f;
  double d3 = 9007199254740993.0;
  double d4 = 1e23;
  double d5 = 1.0000000000000000001e-10;
  double d6 = 0x1.0p3;
  double d7 = 3.14159265358979323846264338327950288;
  double d8 = 1_000.123_456_789_012_345_678;
  double d9 = 123456789.123456789012;
  float f4 = 3.4028235e38f;
  double d11 = .1234567890123456789;
  double d12 = 12345678901234567890d;
  float f5 = 1e-10f;
  double d13 = 0.00001234567890123456789;
  double d14 = 1.5;
  double d15 = 100000000000000000000.0;
  double d16 = 0.1234567890123456789012345678901234567890123456789;

  private static final String EMPTY = "";
  private static final String EMPTY_STR = "";
  static final String EMPTY_STRING = "";
  private static final String EMPTY_NOT = "x";
  private static final Object OTHER_EMPTY = "";

  String useEmpty() {
    return EMPTY + B5Decl.EMPTY_STR + EMPTY_STRING;
  }

  static class Inner {
    String use() {
      return EMPTY;
    }
  }

  static class Shadow {
    private static final String EMPTY = "";

    String use(String x) {
      return EMPTY + x;
    }
  }

  static class Local {
    String use() {
      String EMPTY = "";
      return EMPTY;
    }
  }

  static class Later {
    String use() {
      return LATER_EMPTY;
    }

    private static final String LATER_EMPTY = "";
  }

  static final Throwable STATIC_ERROR = new RuntimeException();
  static Exception noInit;
  static final RuntimeException ANOTHER = new IllegalStateException("x"), THIRD = null;
  final Exception instanceError = new Exception();
  static final Object NOT_THROWABLE = new Object();
  static Throwable lateError;

  void assign(Throwable t) {
    lateError = t;
    noInit = new Exception();
    this.instanceError2 = t;
    B5Decl.lateError = t;
    Runnable r = () -> lateError = t;
    new Object() {
      void f() {
        lateError = t;
      }
    };
  }

  Throwable instanceError2;

  B5Decl() {
    lateError = new Error();
  }

  List<String> list = new ArrayList<>();
  Map<String, String> map = new HashMap<>();
  Map<String, String> concurrent = new ConcurrentHashMap<>();
  List<String> cow = new CopyOnWriteArrayList<>();

  void loops(List<String> items, Map<String, String> m, List<String> other) {
    for (String s : items) {
      items.remove(s);
    }
    for (String s : items) {
      items.add(s);
      break;
    }
    for (String s : items) {
      if (s.isEmpty()) {
        items.remove(s);
        return;
      }
    }
    for (String s : items) {
      other.add(s);
    }
    for (String k : m.keySet()) {
      m.remove(k);
    }
    for (String k : m.values()) {
      m.put(k, k);
    }
    for (Map.Entry<String, String> e : m.entrySet()) {
      m.clear();
    }
    for (String s : cow) {
      cow.remove(s);
    }
    for (String s : concurrent.keySet()) {
      concurrent.remove(s);
    }
    for (String s : this.list) {
      this.list.add(s);
    }
    for (String s : list) {
      this.list.add(s);
    }
    for (String s : items) {
      for (String t : other) {
        items.add(t);
      }
    }
    for (String s : items) {
      Runnable r = () -> items.add("x");
      if (items.remove(s)) {
        System.out.println();
      }
    }
    for (String s : items) {
      boolean b = items.contains(s);
      items.size();
    }
    for (String s : items) {
      new Object() {
        void f() {
          items.add("x");
        }
      };
    }
    for (String s : items) items.add(s);
    for (String s : items) {
      items.add(s);
      System.out.println();
      continue;
    }
  }

  int x;
  String name;
  static int y = B5Decl.y;
  static int z = B5Decl.zz;
  static int zz;
  int w = B5Decl.zz;

  B5Decl(int x, String nme, int other) {
    x = x;
    this.x = x;
    this.name = this.name;
    name = name;
  }

  void selfs(int x, String name, B5Decl other) {
    x = x;
    this.x = this.x;
    name = requireNonNull(name);
    this.name = requireNonNull(this.name);
    this.x = (int) this.x;
    other.x = other.x;
    other.name = other.name;
    this.x = other.x;
    x = (x);
    int local = 1;
    local = local;
  }

  void noParam() {
    this.x = x;
    x = x;
  }

  void similar(int count, long bigCount, int x2, int y2) {
    this.x = x;
    this.zzz = zzz;
  }

  int zzz;
}
