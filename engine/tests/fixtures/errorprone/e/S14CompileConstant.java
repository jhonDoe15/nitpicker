package e;

import com.google.common.collect.ImmutableList;
import com.google.errorprone.annotations.CompileTimeConstant;

public class S14CompileConstant {
  public static final String S = "Hello";
  static final int N = 4;

  public void m(String p, @CompileTimeConstant String q) {}

  public static void sm(@CompileTimeConstant String p, int i) {}

  public static void varargs(String s, @CompileTimeConstant String... p) {}

  void fieldAccess(String s) {
    this.m("boo", s);
    this.m("boo", s + "boo");
    this.m(s, "boo");
    this.m(s, S);
    this.m(s, S + " World!");
    this.m(s, (S));
    this.m(s, N > 3 ? "a" : "b");
    this.m(s, null);
    this.m(s, (String) null);
    this.m(s, (s));
    this.m(s, s.trim());
    this.m(s, String.valueOf(N));
  }

  void statics(String s) {
    sm(s, 19);
    sm("a", 19);
    S14CompileConstant.sm(s, 1);
    varargs(s);
    varargs(s, "a", "b");
    varargs(s, "a", s);
    varargs(s, s, "b");
    varargs(s, new String[] {s});
  }

  void parameters(@CompileTimeConstant final String x, @CompileTimeConstant String y, @CompileTimeConstant String z) {
    m(x, x);
    m(x, y);
    z = "reassigned";
    m(x, z);
    m(x, (z));
    sm(z, 1);
  }

  S14CompileConstant() {}

  S14CompileConstant(@CompileTimeConstant String c) {}

  S14CompileConstant(@CompileTimeConstant String c, String d) {
    this(d);
  }

  void constructors(String s) {
    new S14CompileConstant("a");
    new S14CompileConstant(s);
    new S14CompileConstant(s) {};
    new S14CompileConstant("a", s);
    new S14CompileConstant(S, s);
  }

  static class Sub extends S14CompileConstant {
    Sub(String s) {
      super(s);
    }

    Sub() {
      super("x");
    }
  }

  enum Kind {
    A("x"),
    B(S);

    Kind(@CompileTimeConstant String name) {}
  }

  enum Bad {
    C(new Object().toString());

    Bad(@CompileTimeConstant String name) {}
  }

  @CompileTimeConstant String notFinal;
  @CompileTimeConstant String first, second;
  @CompileTimeConstant final String finalConstant = "x";
  @CompileTimeConstant final String finalNonConstant = new Object().toString();
  @CompileTimeConstant final String finalNull = null;
  @CompileTimeConstant final String blank;
  @CompileTimeConstant static final String STATIC = "s" + "t";
  @CompileTimeConstant static final String STATIC_BAD = String.valueOf(1);
  final ImmutableList<String> list = ImmutableList.of("a");

  interface Constants {
    @CompileTimeConstant String VALUE = "v";
    @CompileTimeConstant String BAD = new Object().toString();
  }

  {
    blank = "blank";
  }

  void assign(String s) {
    notFinal = s;
    notFinal = "x";
    this.notFinal = s;
    this.notFinal = "y";
    first = S14CompileConstant.S;
    first += s;
    String local = s;
    local = s;
  }

  void useFields(String s) {
    m(s, notFinal);
    m(s, this.notFinal);
    m(s, finalConstant);
    m(s, this.finalConstant);
    m(s, STATIC);
    m(s, S14CompileConstant.STATIC);
    m(s, Constants.VALUE);
    m(s, (notFinal));
    sm(notFinal, 1);
  }

  abstract static class Base {
    abstract void apply(String y);

    abstract void marked(@CompileTimeConstant String y);

    void plain(String a, String b) {}
  }

  static class Derived extends Base {
    @Override
    void apply(@CompileTimeConstant String s) {}

    @Override
    void marked(@CompileTimeConstant String s) {}

    @Override
    void plain(String a, @CompileTimeConstant String b) {}
  }

  interface Marked {
    void apply(@CompileTimeConstant String s);
  }

  interface Unmarked {
    void apply(String s);
  }

  static void target(@CompileTimeConstant String s) {}

  void references() {
    Marked a = S14CompileConstant::target;
    Unmarked b = S14CompileConstant::target;
    Marked c = (@CompileTimeConstant String s) -> {};
    Unmarked d = (@CompileTimeConstant String s) -> {};
    Unmarked e = s -> target(s);
    Marked f = s -> target(s);
    Unmarked g = (String s) -> sm(s, 1);
  }

  int switched(int k, String s) {
    m(s, switch (k) {
      case 1 -> "a";
      default -> "b";
    });
    m(s, switch (k) {
      case 1 -> "a";
      default -> s;
    });
    m(s, switch (k) {
      case 1 -> "a";
      default -> throw new RuntimeException();
    });
    return 0;
  }

  @SuppressWarnings("CompileTimeConstant")
  void suppressed(String s) {
    this.m("boo", s);
  }
}
