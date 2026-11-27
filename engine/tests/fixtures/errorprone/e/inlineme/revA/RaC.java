package ivra;
import com.google.errorprone.annotations.InlineMe;
import com.google.errorprone.annotations.InlineMeValidationDisabled;
import java.util.*;
import java.util.function.*;

public class RaC {
  int f(int x) { return x; }
  public int hh() { return 1; }
  // reuse / lambda / conditional / braces / argN
  @InlineMe(replacement = "x") @Deprecated public int d1(int a) { return a + a; }
  @InlineMe(replacement = "x") @Deprecated public int d2(int a, int b) { return a + b + b + a; }
  @InlineMe(replacement = "x") @Deprecated public int d3(int a, int b) { return b + a + a + b; }
  @InlineMe(replacement = "x") @Deprecated public int d4(int a) { return a > 0 ? a : 1; }
  @InlineMe(replacement = "x") @Deprecated public Object d5(int a) { return Optional.of(1).map(q -> q + a); }
  @InlineMe(replacement = "x") @Deprecated public Object d6(int a) { return Optional.of(1).map(q -> q + 1); }
  @InlineMe(replacement = "x") @Deprecated public Object d7(int a) { return Optional.of(1).map(q -> { return q + 1; }); }
  @InlineMe(replacement = "x") @Deprecated public Object d8(Supplier<Integer> a) { return (a == null) ? 1 : 2; }
  @InlineMe(replacement = "x") @Deprecated public Object d9(boolean a) { return foo(a ? 1 : 2); }
  @InlineMe(replacement = "x") @Deprecated public Object d10(boolean a, int b) { return foo(a, a ? 1 : 2); }
  @InlineMe(replacement = "x") @Deprecated public Object d11(String a) { return "{" + a; }
  @InlineMe(replacement = "x") @Deprecated public Object d12(String a) { return '{' + a; }
  @InlineMe(replacement = "x") @Deprecated public Object d13(String a) { return a /* { */ + 1; }
  @InlineMe(replacement = "x") @Deprecated public Object d14(String a) { return new int[] {1}; }
  @InlineMe(replacement = "x") @Deprecated public Object d15(String a) { return new int[1]; }
  @InlineMe(replacement = "x") @Deprecated public Object d16(String a) { return (Runnable) () -> a.length(); }
  @InlineMe(replacement = "x") @Deprecated public Object d17(String a) { return (Runnable) () -> foo(1); }
  @InlineMe(replacement = "x") @Deprecated public Object d18(String a) { return (Runnable) this::hh; }
  @InlineMe(replacement = "x") @Deprecated public Object d19(String a) { return (Supplier<Integer>) a::length; }
  @InlineMe(replacement = "x") @Deprecated public Object d20(String a) { return (Supplier<Integer>) a::length; }
  @InlineMe(replacement = "x") @Deprecated public Object d21(String a) { return foo(a, a); }
  @InlineMe(replacement = "x") @Deprecated public Object d22(String a) { return foo(a.length(), a.hashCode()); }
  @InlineMe(replacement = "x") @Deprecated public Object d23(String a) { return foo(a.length(), "a"); }
  @InlineMe(replacement = "x") @Deprecated public Object d24(String a, String b) { return foo(a.length(), (Supplier<Integer>) b::length, a); }
  @InlineMe(replacement = "x") @Deprecated public Object d25(String a, String b) { return foo((Supplier<Integer>) () -> b.length(), a); }
  @InlineMe(replacement = "x") @Deprecated public Object d26(String a) { return switch (a) { case "x" -> 1; default -> 2; }; }
  @InlineMe(replacement = "x") @Deprecated public Object d27(String a) { return a instanceof String s && s.isEmpty(); }
  @InlineMe(replacement = "x") @Deprecated public Object d28(String a) { return foo(a.length() > 0 ? 1 : 2, 3); }
  @InlineMe(replacement = "x") @Deprecated public Object d29(int a) { return foo(true ? 1 : 2, a); }
  @InlineMe(replacement = "x") @Deprecated public Object d30(int arg0) { return arg0; }
  @InlineMe(replacement = "x") @Deprecated public Object d31(int arg) { return arg; }
  @InlineMe(replacement = "x") @Deprecated public Object d32(int arg12x) { return arg12x; }
  @InlineMe(replacement = "x") @Deprecated public Object d33(int a, int arg1) { return a; }
  @InlineMe(replacement = "x") @Deprecated public Object d34(int Arg1) { return Arg1; }
  @InlineMe(replacement = "x") @Deprecated public Object d35(int a, int b) { return foo(a, b, a); }
  @InlineMe(replacement = "x") @Deprecated public Object d36(int a, int arg5) { return foo(arg5, arg5); }
  @InlineMe(replacement = "x") @Deprecated public Object d37(int arg5) { return privz(arg5); }
  @InlineMe(replacement = "x") @Deprecated public Object d38(int a) { return a++; }
  @InlineMe(replacement = "x") @Deprecated public Object d39(int a) { return a = 1; }
  @InlineMe(replacement = "x") @Deprecated public void d40(int[] a) { a[0] = a[1]; }
  @InlineMe(replacement = "x") @Deprecated public void d41(RaC a) { a.fld = 1; }
  @InlineMe(replacement = "x") @Deprecated public void d42(RaC a) { a.pfld = 1; }
  @InlineMe(replacement = "x") @Deprecated public void d43(RaC a) { this.pfld = 1; }
  @InlineMe(replacement = "x") @Deprecated public void d44(RaC a) { this.fld = a.fld; }
  @InlineMe(replacement = "x") @Deprecated public void d45(int a) { fld += a; }
  @InlineMe(replacement = "x") @Deprecated public void d46(int a) { pfld += a; }
  @InlineMe(replacement = "x") @Deprecated public void d47(int a) { RaC.sfld = a; }
  @InlineMe(replacement = "x") @Deprecated public void d48(int a) { psfld = a; }
  @InlineMe(replacement = "x") @Deprecated public void d49(int a) { new RaC().pfld = a; }
  @InlineMe(replacement = "x") @Deprecated public void d50(int a) { this.fld = this.fld + a; }
  public int fld; private int pfld; public static int sfld; private static int psfld;
  private Object privz(int x) { return x; }
  static Object foo(Object... o) { return o; }
  @InlineMe(replacement = "x") @Deprecated public final int e1(int a) { return a; }
  @InlineMe(replacement = "x") @Deprecated public static int e2(int a) { return a; }
  @InlineMe(replacement = "x") @Deprecated public int e3(int a) { return a; }
  @InlineMe(replacement = "x") @Deprecated protected int e4(int a) { return a; }
  @InlineMe(replacement = "x") @Deprecated int e5(int a) { return a; }
  @InlineMe(replacement = "x") @Deprecated public <U> U e6(U a) { return a; }
  @InlineMe(replacement = "x") @Deprecated
  public
  int
  e7
  (int a) { return a; }
  @InlineMe(replacement = "x") @Deprecated public strictfp int e8(int a) { return a; }
  @InlineMe(replacement = "x") @Deprecated public synchronized int e9(int a) { return a; }
  @InlineMe(replacement = "x") @Deprecated public native int e10(int a);
  public static final class Fin {
    @InlineMe(replacement = "x") @Deprecated public int e1(int a) { return a; }
    @InlineMe(replacement = "x") @Deprecated public Object e2(int a) { return new Object() { @InlineMe(replacement = "x") @Deprecated public int z(int a) { return a; } }; }
    @InlineMe(replacement = "x") @Deprecated public void e3() { Runnable r = new Runnable() { @InlineMe(replacement = "x") @Deprecated public void run() { hh(); } }; }
    int hh() { return 1; }
    class Inner { @InlineMe(replacement = "x") @Deprecated public int e1(int a) { return a; } }
  }
  public interface Itf {
    @InlineMe(replacement = "x") @Deprecated default int e1(int a) { return a; }
    @InlineMe(replacement = "x") @Deprecated static int e2(int a) { return a; }
    @InlineMe(replacement = "x") @Deprecated int e3(int a);
    @InlineMe(replacement = "x") @Deprecated private int e4(int a) { return a; }
    @InlineMe(replacement = "x") @Deprecated private static int e5(int a) { return a; }
    @InlineMe(replacement = "x") @Deprecated default int e6(int a) { return hh2(); }
    int hh2();
    class N { @InlineMe(replacement = "x") @Deprecated public int e1(int a) { return a; } int zz() { return 1; }
       @InlineMe(replacement = "x") @Deprecated public int e2(int a) { return zz(); } }
  }
  public enum En {
    ;
    @InlineMe(replacement = "x") @Deprecated public int e1(int a) { return a; }
    @InlineMe(replacement = "x") @Deprecated En() {  }
    @InlineMe(replacement = "x") @Deprecated En(int a) { this(); }
    @InlineMe(replacement = "x") @Deprecated public final int e2(int a) { return a; }
  }
  public enum En2 {
    A, B;
    @InlineMe(replacement = "x") @Deprecated public int e1(int a) { return a; }
  }
  public record Rec(int a, int b) {
    @InlineMe(replacement = "x") @Deprecated public int e1(int q) { return q; }
    @InlineMe(replacement = "x") @Deprecated public Rec(int a) { this(a, 1); }
    @InlineMe(replacement = "x") @Deprecated public Rec { }
    @InlineMe(replacement = "x") @Deprecated public int a() { return a; }
    @InlineMe(replacement = "x") @Deprecated public int bb() { return b; }
    @InlineMe(replacement = "x") @Deprecated public int cc() { return this.b; }
  }
  public record Rec2(int a, int b) {
    @InlineMe(replacement = "x") @Deprecated public Rec2(int a, int b) { this.a = a; this.b = b; }
  }
  public abstract static class Abs {
    @InlineMe(replacement = "x") @Deprecated public abstract int e1(int a);
    @InlineMe(replacement = "x") @Deprecated public Abs() { }
    @InlineMe(replacement = "x") @Deprecated public Abs(int q) { super(); }
    @InlineMe(replacement = "x") @Deprecated public int e2() { return 1; }
  }
  public static class Dis3 {
    @InlineMeValidationDisabled("a") @InlineMe(replacement = "x") @Deprecated public int e1(int a) { return a; }
    @SuppressWarnings("InlineMeValidator") @InlineMe(replacement = "x") @Deprecated public int e2(int a) { return a; }
    @SuppressWarnings("all") @InlineMe(replacement = "x") @Deprecated public int e3(int a) { return a; }
    @SuppressWarnings({"InlineMeValidator", "x"}) @InlineMe(replacement = "x") @Deprecated public int e4(int a) { return a; }
    @InlineMe(replacement = "x") @InlineMeValidationDisabled("x") public int e5(int a) { return a; }
    @InlineMe(replacement = "x") @Deprecated public Object e6() { return new Object() { @InlineMeValidationDisabled("a") @InlineMe(replacement = "x") @Deprecated public int e1(int a) { return a; } }; }
  }
}
