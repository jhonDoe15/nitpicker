package n;

class FieldEdges {
  static class Compound {
    String a;
    String b;

    Compound() {
      a += "x";
      b = "b";
      b += a;
    }
  }

  static class FinallyReturn {
    String a;
    String b;
    String c;

    FinallyReturn(boolean flag) {
      try {
        a = "a";
        if (flag) {
          return;
        }
        b = "b";
      } finally {
        c = "c";
      }
    }
  }

  record Canonical(String name, String other) {
    Canonical(String name, String other) {
      this.name = name;
      this.other = this.name;
    }
  }

  record Compact(String name) {
    Compact {
      String seen = name;
    }
  }

  static class Base {
    String inherited = "i";

    @Initializer
    void start() {}
  }

  static class Derived extends Base {
    String own;
    String late;

    Derived() {
      super.inherited = "x";
      String seen = inherited;
    }

    @Override
    void start() {
      own = "o";
      String seen = late;
    }
  }

  static class Outer {
    String value;

    Outer() {
      value = "v";
    }

    class Inner {
      String value;
      String mine;

      Inner() {
        Outer.this.value = "o";
        mine = Outer.this.value;
      }
    }

    class Other {
      String mine;

      Other() {
        value = "o";
        String seen = value;
      }
    }
  }

  static class Labels {
    String a;
    String b;

    Labels(int n) {
      outer:
      for (int i = 0; i < n; i++) {
        for (;;) {
          a = "a";
          if (i > 2) {
            break outer;
          }
          b = "b";
          continue outer;
        }
      }
    }
  }

  static class Conditions {
    String a;
    String b;
    String c;
    String d;

    Conditions(boolean flag, @Nullable String maybe) {
      a = flag ? "x" : "y";
      b = flag ? "x" : null;
      c = maybe == null ? "x" : maybe;
      if (flag && (d = "d") != null) {
        return;
      }
      String seen = (d);
      boolean same = d == null;
      boolean again = null != this.d;
    }
  }

  static class Synchronized {
    String a;
    String b;

    Synchronized() {
      synchronized (this) {
        a = "a";
      }
      new Thread(() -> b = "b").start();
      Runnable later =
          new Runnable() {
            String inside;

            @Override
            public void run() {
              b = "b";
              String seen = inside;
            }
          };
    }
  }

  static class ThrowingEnd {
    String a;

    ThrowingEnd() {
      throw new IllegalStateException();
    }
  }

  static class Generic<T> {
    T value;
    T[] values;
    java.util.List<T> list;

    Generic() {}
  }

  static class StaticFinal {
    static final String A;
    static final String B;

    static {
      A = "a";
      String maybe = System.getProperty("x");
      B = maybe;
    }
  }
}
