package n;

import java.util.ArrayList;
import java.util.List;

class Fields {
  static class NoConstructor {
    String plain;
    @Nullable String optional;
    int count;
    String given = "a";
    final List<String> fixed = new ArrayList<>();
    String first, second;
    String[] array;
    int[] numbers;
    static String shared;
    static String sharedGiven = "s";
    static @Nullable String sharedOptional;
  }

  static class OneConstructor {
    String name;
    String other;
    final String last;
    String late;

    OneConstructor(String name, boolean flag) {
      this.name = name;
      this.last = name;
      if (flag) {
        other = name;
      }
    }
  }

  static class TwoConstructors {
    String a;
    String b;
    @SuppressWarnings("NullAway.Init")
    String quiet;
    String c;

    TwoConstructors() {
      b = "b";
    }

    TwoConstructors(String a) {
      this.a = a;
      c = a;
    }

    TwoConstructors(int n) {
      this("x");
    }

    @SuppressWarnings("NullAway.Init")
    TwoConstructors(long n) {}

    @SuppressWarnings("NullAway")
    TwoConstructors(char n) {}
  }

  static class ThrowsAndReturns {
    String a;
    String b;
    String c;

    ThrowsAndReturns(boolean early, @Nullable String given) {
      a = "a";
      if (given == null) {
        throw new IllegalStateException();
      }
      c = given;
      if (early) {
        return;
      }
      b = "b";
    }
  }

  static class AssignsNull {
    String a;
    String b;
    String c;
    String d;

    AssignsNull(@Nullable String maybe, String sure) {
      a = null;
      b = maybe;
      c = sure;
      if (maybe != null) {
        d = maybe;
      } else {
        d = sure;
      }
    }
  }

  static class Dereferenced {
    String a;
    String b;
    String c;

    Dereferenced() {
      a.length();
      if (b != null) {
        b.length();
      }
      java.util.Objects.requireNonNull(c);
    }
  }

  static class Blocks {
    String inBlock;
    String inMaybe;
    String never;
    static String sharedInBlock;
    static String sharedMaybe;
    static String sharedNever;

    {
      inBlock = "x";
      if (inBlock.isEmpty()) {
        inMaybe = "y";
      }
    }

    static {
      sharedInBlock = "x";
      if (sharedInBlock.isEmpty()) {
        sharedMaybe = "y";
      }
    }

    Blocks() {}
  }

  static class SafeCalls {
    String byPrivate;
    String byFinal;
    String byOpen;
    String byStatic;
    String byNested;
    String byOther;
    String byTry;
    String byCaught;
    String byArgument;

    SafeCalls(SafeCalls other) {
      setPrivate();
      this.setFinal();
      setOpen();
      setStatic(this);
      setOuter();
      other.setOther();
      try {
        setTry();
      } finally {
        other.setOther();
      }
      try {
        setCaught();
      } catch (RuntimeException e) {
        throw e;
      }
      String unused = setArgument();
    }

    private void setPrivate() {
      byPrivate = "a";
    }

    final void setFinal() {
      byFinal = "a";
    }

    void setOpen() {
      byOpen = "a";
    }

    private static void setStatic(SafeCalls it) {
      it.byStatic = "a";
    }

    private void setOuter() {
      setNested();
    }

    private void setNested() {
      byNested = "a";
    }

    private void setOther() {
      byOther = "a";
    }

    private void setTry() {
      byTry = "a";
    }

    private void setCaught() {
      byCaught = "a";
    }

    private String setArgument() {
      byArgument = "a";
      return byArgument;
    }
  }

  static final class Closed {
    String a;

    Closed() {
      set();
    }

    void set() {
      a = "a";
    }
  }

  enum Kind {
    ONE,
    TWO;

    String label;
    String other;

    Kind() {
      set();
    }

    void set() {
      label = "a";
    }
  }

  enum Open {
    ONE {
      String inner;
    };

    String label;

    Open() {
      set();
    }

    void set() {
      label = "a";
    }
  }

  static class WithInitializer {
    String a;
    String b;
    String c;

    WithInitializer() {
      a = "a";
    }

    @Initializer
    void start() {
      b = a + "b";
      String seen = c;
    }
  }

  static class TwoInitializers {
    String a;
    String b;

    @Initializer
    void first() {
      a = "a";
    }

    @Initializer
    void second() {}
  }

  static class StaticInitializer {
    static String a;
    static String b;

    @Initializer
    static void start() {
      a = "a";
    }
  }

  static class Reads {
    String a;
    String b;
    String c;
    String d;
    String e;
    final String f;
    int length = a.length();
    String copy = b;

    {
      c = "c";
    }

    String afterBlock = c;

    Reads(Reads other, boolean flag) {
      String early = a;
      a = "a";
      String late = a;
      if (b == null) {
        b = this.d;
      }
      String fromOther = other.e;
      if (flag) {
        e = "e";
      }
      String maybe = e;
      Runnable later = () -> System.out.println(d);
      f = d.trim();
      setD();
      String now = d;
      b += "x";
      String again = (d);
    }

    Reads(Reads other) {
      this(other, true);
      String fine = d;
    }

    private void setD() {
      d = "d";
    }

    void method() {
      String fine = a;
    }
  }

  static class StaticReads {
    static String a;
    static String b;
    static String early = a;

    static {
      String before = a;
      a = "a";
      String after = a;
    }

    static String late = a;

    StaticReads() {
      String fine = b;
    }

    {
      String fine = b;
    }
  }

  static class Loops {
    String a;
    String b;
    String c;

    Loops(List<String> all) {
      while (true) {
        a = "a";
        if (all.isEmpty()) {
          break;
        }
      }
      for (String one : all) {
        b = one;
      }
      do {
        c = "c";
      } while (all.isEmpty());
    }
  }

  static class Switches {
    String a;
    String b;

    Switches(int kind) {
      switch (kind) {
        case 1:
          a = "1";
          break;
        default:
          a = "d";
      }
      switch (kind) {
        case 1 -> b = "1";
        case 2 -> {}
        default -> b = "d";
      }
    }
  }

  static class Tries {
    String a;
    String b;
    String c;

    Tries() {
      try {
        a = "a";
        b = String.valueOf(1);
      } catch (RuntimeException e) {
        a = "x";
      } finally {
        c = "c";
      }
    }
  }

  @SuppressWarnings("NullAway.Init")
  static class Quiet {
    String a;
    static String b;

    Quiet() {}
  }

  interface Shape {
    String NAME = "n";
  }

  record Point(String name, @Nullable String tag) {
    static String shared;
  }

  Object anonymous() {
    return new Object() {
      String inner;
      String set;

      {
        fill();
      }

      void fill() {
        set = "s";
      }
    };
  }

  void local() {
    class Local {
      String inner;
      static String shared;
    }
  }

  abstract static class Abstract {
    String a;

    abstract void set();

    native void fill();
  }
}
