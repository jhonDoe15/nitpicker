package e;

import java.io.Console;

class S19Simple {
  interface I {
    int foo();
  }

  int switchExpr(int i) {
    return switch (i) {
      default:
        yield -1;
    };
  }

  int switchExprTwo(int i) {
    return switch (i) {
      case 1:
      case 2:
        yield 3;
      case 4:
        yield 5;
      default:
        yield -1;
    };
  }

  void switchStatement(int i) {
    switch (i) {
      default:
        return;
    }
  }

  void switchArrowStatement(int i) {
    switch (i) {
      default -> System.err.println();
    }
  }

  int switchArrow(int i) {
    return switch (i) {
      default -> -1;
    };
  }

  @SuppressWarnings("TraditionalSwitchExpression")
  int switchSuppressed(int i) {
    return switch (i) {
      default:
        yield -1;
    };
  }

  static transient String foo1;
  static transient String foo2;
  public static final transient String foo3 = "";
  protected static final transient String foo4 = "";
  static transient int a, b;
  transient String instanceOnly;
  static String plain;
  static /* c */ transient volatile String commented;

  @SuppressWarnings("TransientMisuse")
  static transient String suppressed;

  record One(@Override int bar) implements I {
    @Override
    public int foo() {
      return bar();
    }
  }

  record Two(@Override int foo) implements I {}

  record Three(@Override int bar) {}

  record Four(@ Override int bar) {}

  record Five(@Override @Deprecated int a, @Deprecated int b, int c) {}

  @SuppressWarnings("RecordComponentOverride")
  record Seven(@Override int a) {}

  record Eight(@Deprecated int a) {}

  static class Nulls {
    final boolean cond = false;

    public String toString() {
      return null;
    }
  }

  static class NullCond {
    final boolean cond = false;

    public String toString() {
      return cond ? null : "foo";
    }
  }

  static class NullParen {
    public String toString() {
      return ((null));
    }
  }

  static class NullNested {
    final boolean cond = false;

    public String toString() {
      return cond ? "a" : (cond ? "b" : null);
    }
  }

  static class NullBranch {
    public String toString() {
      if (hashCode() == 1) {
        return "a";
      }
      for (int i = 0; i < 3; i++) {
        try {
          return null;
        } finally {
          System.err.println();
        }
      }
      return "b";
    }
  }

  static class NullInSwitch {
    public String toString() {
      switch (hashCode()) {
        case 1:
          return "x";
        default:
          return null;
      }
    }
  }

  static class NullCondition {
    public String toString() {
      return (String) null;
    }
  }

  static class NonNull {
    public String toString() {
      return "foo";
    }
  }

  static class NotToString {
    public String thisIsNotAToStringMethod() {
      return null;
    }
  }

  static class NotPublic {
    String toString(int x) {
      return null;
    }
  }

  static class NestedClassReturn {
    public String toString() {
      class InnerTest {
        String getter() {
          return null;
        }
      }
      return "bar";
    }
  }

  interface Greeting {
    String processName();
  }

  static class LambdaReturn {
    public String toString() {
      Greeting lol =
          () -> {
            String lolz = "";
            return null;
          };
      return "bar";
    }
  }

  static class Anonymous {
    public String toString() {
      Greeting g =
          new Greeting() {
            public String processName() {
              return null;
            }
          };
      return "bar";
    }
  }

  static class SuppressedNull {
    @SuppressWarnings("ToStringReturnsNull")
    public String toString() {
      return null;
    }
  }

  static class Swig {
    private long swigCPtr;
    protected boolean swigCMemOwn;

    public Swig(long cPtr, boolean cMemoryOwn) {
      swigCMemOwn = cMemoryOwn;
      swigCPtr = cPtr;
    }

    public synchronized void delete() {
      if (swigCPtr != 0) {
        if (swigCMemOwn) {
          swigCMemOwn = false;
          throw new UnsupportedOperationException("C++ destructor does not have public access");
        }
        swigCPtr = 0;
      }
    }
  }

  static class SwigFinalizer {
    private long swigCPtr;
    protected boolean swigCMemOwn;

    @SuppressWarnings("removal")
    protected void finalize() {
      delete();
    }

    public synchronized void delete() {
      if (swigCMemOwn) {
        throw new UnsupportedOperationException("C++ destructor does not have public access");
      }
    }
  }

  static class SwigOther {
    public void remove() {
      throw new UnsupportedOperationException("C++ destructor does not have public access");
    }

    public void delete() {
      Runnable r =
          new Runnable() {
            public void run() {
              throw new UnsupportedOperationException("C++ destructor does not have public access");
            }
          };
    }
  }

  static class SwigAnonymousDelete {
    @SuppressWarnings("removal")
    protected void finalize() {}

    public void run() {
      Object o =
          new Object() {
            void delete() {
              String s = "C++ destructor does not have public access";
            }
          };
    }
  }

  static class SwigEnum {
    enum E {
      A;

      void delete() {
        String s = "C++ destructor does not have public access";
      }
    }
  }

  static class SwigSuppressed {
    @SuppressWarnings("SwigMemoryLeak")
    void delete() {
      String s = "C++ destructor does not have public access";
    }
  }

  boolean consoleNotNull() {
    return System.console() != null;
  }

  boolean consoleNull() {
    return System.console() == null;
  }

  boolean consoleLocalNull() {
    Console c = System.console();
    return c == null;
  }

  boolean consoleLocalNotNull() {
    Console c = System.console();
    return c != null;
  }

  boolean consoleLocalTwice() {
    Console c = System.console();
    if (null == c) {
      return false;
    }
    return c != null;
  }

  boolean consoleFinalLocal() {
    final Console c = System.console();
    Runnable r = () -> System.err.println(c == null);
    return c != null;
  }

  Console consoleReturn() {
    return System.console();
  }

  boolean consoleReassigned() {
    Console c = System.console();
    c = null;
    return c == null;
  }

  boolean consoleParens() {
    return (System.console()) != null;
  }

  boolean consoleShadow() {
    Console c = System.console();
    class Inner {
      boolean f(Console c) {
        return c == null;
      }
    }
    return false;
  }

  final Console fieldConsole = System.console();
  Console nonFinalField = System.console();

  boolean useFields() {
    return fieldConsole == null || nonFinalField == null;
  }

  @SuppressWarnings("SystemConsoleNull")
  boolean consoleSuppressed() {
    return System.console() != null;
  }

  boolean consoleSuppressedUse() {
    Console c = System.console();
    @SuppressWarnings("SystemConsoleNull")
    boolean b = c == null;
    return c != null;
  }

  void consoleOther(Console param) {
    boolean b = param == null;
  }
}
