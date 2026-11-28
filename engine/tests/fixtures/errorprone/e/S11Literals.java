package e;

import com.google.errorprone.annotations.CompileTimeConstant;
import java.util.Iterator;

@SuppressWarnings("NullAway")
class S11Literals {
  String text = "Îñţérñåţîöñåļîžåţîờñ";

  void literals() {
    long value = 123432l;
    value = 0l;
    value = -123432l;
    value = -  123432l;
    value = 0x8abcDEF0l;
    value = 0X80l;
    value = 0x0l;
    value = -0x8abcDEF0l;
    value = -0X80l;
    value = -  0x8abcDEF0l;
    value = 06543l;
    value = 00l;
    value = -06543l;
    value = -  06543l;
    value = 0b101l;
    value = 1_000l + 2l;
    value = (3l);
    value = -(3l);
    value = 123432L;
    value = 0L;
    value = -3L;
    value = 3;
    value = -3;
    value = 0x80L;
    value = 0x0L;
    value = -0x80L;
    String s = "0l";
    long ell = 0L;
    value = ell;
    float f = 1.5f;
    int i = 0x1f;
    double d = 1e3;
  }

  @SuppressWarnings("LongLiteralLowerCaseSuffix")
  long quiet() {
    return 5l;
  }

  int h9() {
    int sum = 0;
    int i, j;
    for (i = 0; i < 10; ++i) {
      for (j = 0; j < 10; ++i) {
        sum += j;
      }
    }
    return sum;
  }

  int h9fine() {
    int sum = 0;
    int i, j;
    for (i = 0; i < 10; ++i) {
      for (j = 0; j < 10; ++i) {
        sum += j;
        j++;
      }
    }
    return sum;
  }

  void loops(Iterable<String> xs, boolean flag, int n) {
    for (int i = 0; i < 10; ) {}
    for (int i = 0; i < 10; i++) {
      System.err.println(i);
    }
    Iterator<String> it = xs.iterator();
    while (it.hasNext()) {
      System.err.println(it.next());
    }
    for (; ; ) {}
  }

  void loops2(int n) {
    for (int i = 0; i < 10; ) {
      i++;
    }
    int k = 0;
    while (k++ < 10) {}
    int a = 0;
    while (a < n) {
      n--;
    }
    int b = 0, c = 5;
    while (b < c + 1) {
      System.err.println(b);
    }
    do {
      b = 2;
    } while (b < 5);
    do {
      System.err.println();
    } while (b < 5 && c > 1);
    while (n > 0) {
      n = n - 1;
    }
    int m = 0;
    while (!(m > 3)) {
      m += 1;
    }
    boolean go = true;
    while (go) {
      System.err.println();
    }
    while (true) {}
  }

  int field = 0;

  void fieldLoop() {
    while (field < 10) {
      g();
    }
  }

  void g() {
    field++;
  }

  @SuppressWarnings("LoopConditionChecker")
  void quietLoop() {
    for (int i = 0; i < 10; ) {}
  }

  void ternaries(boolean b) {
    int x = b ? 0 : null;
    long l = b ? null : 0;
    g1("", b ? null : 0);
    h("", 1, b ? null : 0);
    h("", 1, b ? null : 0, 3);
    int z = 0 + (b ? null : 1);
    z = (b ? null : 1) + 0;
    int fine = b ? 0 : 1;
    Integer y = b ? 0 : null;
    g1("", b ? 1 : 0);
    h("", 1, b ? 1 : 0);
    z = 0 + (b ? 0 : 1);
    boolean t = (b ? 0 : null) == Integer.valueOf(0);
    Object o = b ? "a" : null;
    String str = b ? "a" : null;
  }

  void g1(String s, int y) {}

  void h(String s, int... y) {}

  interface I {
    int f();
  }

  interface J {
    Integer f();
  }

  interface K<X> {
    X f();
  }

  void lambdas(boolean b) {
    I i =
        () -> {
          return b ? null : 1;
        };
    J j =
        () -> {
          return b ? null : 1;
        };
    K<Integer> k =
        () -> {
          return b ? null : 1;
        };
    i = () -> b ? null : 1;
    j = () -> b ? null : 1;
    k = () -> b ? null : 1;
  }

  int switches(int n) {
    return switch (n) {
      case 0 -> 1;
      default -> {
        yield (n % 2 == 0) ? 0 : null;
      }
    };
  }

  String switches2(int n) {
    return switch (n) {
      case 0 -> "zero";
      default -> (n % 2 == 0) ? "even" : null;
    };
  }

  @SuppressWarnings("NullTernary")
  int quietTernary(boolean b) {
    return b ? 0 : null;
  }

  public void compile(@CompileTimeConstant Object x) {
    x = null;
  }

  public void compile2(@CompileTimeConstant Object x, @CompileTimeConstant Object y) {
    x = y = null;
  }

  public void compile3(@CompileTimeConstant Object x, @CompileTimeConstant Object y) {
    y = null;
  }

  public void compileFinal(final @CompileTimeConstant Object x) {}

  public void compileEffectivelyFinal(@CompileTimeConstant Object x) {
    System.err.println(x);
  }

  interface CompileIface {
    void f(@CompileTimeConstant Object x);
  }

  abstract static class CompileAbstract {
    abstract void f(@CompileTimeConstant Object x);
  }

  @SuppressWarnings("NonFinalCompileTimeConstant")
  public void compileQuiet(@CompileTimeConstant Object x) {
    x = null;
  }

  public void compileInc(@CompileTimeConstant int x) {
    x++;
  }

  public void compileLambda(@CompileTimeConstant String x) {
    Runnable r = () -> System.err.println(x);
  }
}
