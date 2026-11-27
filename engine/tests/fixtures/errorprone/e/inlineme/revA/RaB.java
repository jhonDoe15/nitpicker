package ivra;
import com.google.errorprone.annotations.InlineMe;
import java.util.*;
import java.util.function.*;
import static java.util.Collections.emptyList;

public class RaB<T> {
  public enum Color { RED, @Deprecated OLD, GREEN { void x() {} } }
  public static class Holder {
    @Deprecated public static int OLDF = 1;
    public static int NEWF = 1;
    @Deprecated public static class OldNested { public static int Z; }
    @Deprecated public Holder() {}
    public Holder(int x) {}
    public static void v(int... xs) {}
    public static void w(int[] xs) {}
    public static void v2(String s, int... xs) {}
    public static void gen(Object o) {}
  }
  @InlineMe(replacement = "x") @Deprecated public Object a1() { return Color.OLD; }
  @InlineMe(replacement = "x") @Deprecated public Object a2() { return Color.RED; }
  @InlineMe(replacement = "x") @Deprecated public Object a3() { return Holder.OLDF; }
  @InlineMe(replacement = "x") @Deprecated public Object a4() { return Holder.NEWF; }
  @InlineMe(replacement = "x") @Deprecated public Object a5() { return Holder.OldNested.Z; }
  @InlineMe(replacement = "x") @Deprecated public Object a6() { return new Holder(); }
  @InlineMe(replacement = "x") @Deprecated public Object a7() { return new Holder(1); }
  @InlineMe(replacement = "x") @Deprecated public Object a8() { return new Holder.OldNested(); }
  @InlineMe(replacement = "x") @Deprecated public Object a9() { return Color.valueOf("x"); }
  @InlineMe(replacement = "x") @Deprecated public Object a10() { return emptyList(); }
  @InlineMe(replacement = "x") @Deprecated public Object a11() { return new Date().getYear() + Holder.OLDF; }
  @InlineMe(replacement = "x") @Deprecated public Object a12() { return Holder.OLDF + new Date().getYear(); }
  @InlineMe(replacement = "x") @Deprecated public Object a13() { return Holder.NEWF + new Date().getYear(); }

  // class type variable
  @InlineMe(replacement = "x") @Deprecated public Object b1(Object o) { return (T) o; }
  @InlineMe(replacement = "x") @Deprecated public Object b2(Object o) { return new ArrayList<T>(); }
  @InlineMe(replacement = "x") @Deprecated public <U> Object b3(Object o) { return (U) o; }
  @InlineMe(replacement = "x") @Deprecated public <U> Object b4(Object o) { return new ArrayList<U>(); }
  @InlineMe(replacement = "x") @Deprecated public Object b5(Object o) { return this.<T>g(); }
  <U> Object g() { return null; }
  @InlineMe(replacement = "x") @Deprecated public Object b6(Object o) { return RaB.this.hashCode(); }
  @InlineMe(replacement = "x") @Deprecated Object b7(Object o) { return RaB.this.hashCode(); }
  @InlineMe(replacement = "x") @Deprecated Object b8(Object o) { return this.hashCode(); }
  @InlineMe(replacement = "x") @Deprecated public Object b9(Object o) { return this.hashCode(); }
  @InlineMe(replacement = "x") @Deprecated public Object b10(Object o) { return super.hashCode(); }
  @InlineMe(replacement = "x") @Deprecated protected Object b11(Object o) { return super.hashCode(); }
  @InlineMe(replacement = "x") @Deprecated Object b12(Object o) { return super.hashCode(); }
  @InlineMe(replacement = "x") @Deprecated Object b13(Object o) { return super.toString(); }
  @InlineMe(replacement = "x") @Deprecated public Object b14(Object o) { return RaB.super.hashCode(); }
  @InlineMe(replacement = "x") @Deprecated public Object b15(Object o) { return RaB.class; }
  @InlineMe(replacement = "x") @Deprecated public Object b16(Object o) { return int.class; }
  @InlineMe(replacement = "x") @Deprecated public Object b17(Object o) { return int[].class; }
  @InlineMe(replacement = "x") @Deprecated public Object b18(Object o) { return RaB[].class; }
  @InlineMe(replacement = "x") @Deprecated public Object b19(Object o) { return String[].class; }
  @InlineMe(replacement = "x") @Deprecated public Object b20(Object o) { return o instanceof Holder; }
  @InlineMe(replacement = "x") @Deprecated public Object b21(Object o) { return o instanceof Holder.OldNested; }
  @InlineMe(replacement = "x") @Deprecated public Object b22(Object o) { return (Holder.OldNested) o; }
  @InlineMe(replacement = "x") @Deprecated public Object b23(Object o) { return new Holder.OldNested[1]; }
  @InlineMe(replacement = "x") @Deprecated public Object b25(Object o) { return (Supplier<Object>) Holder.OldNested::new; }
  @InlineMe(replacement = "x") @Deprecated public Object b26(Object o) { return (Supplier<Holder.OldNested>) null; }
  @InlineMe(replacement = "x") @Deprecated public Object b27(Object o) { return (Function<Object,Object>) Objects::hashCode; }

  // varargs
  @InlineMe(replacement = "x") @Deprecated public static void c1(int... xs) { Holder.v(xs); }
  @InlineMe(replacement = "x") @Deprecated public static void c2(int... xs) { Holder.w(xs); }
  @InlineMe(replacement = "x") @Deprecated public static void c5(String s, int... xs) { Holder.v2(s, xs); }
  @InlineMe(replacement = "x") @Deprecated public static void c6(String s, int... xs) { Holder.v2(s, xs.length); }
  @InlineMe(replacement = "x") @Deprecated public static Object c7(String s, int... xs) { return xs; }
  @InlineMe(replacement = "x") @Deprecated public static Object c8(String s, int... xs) { return Arrays.asList(xs); }
  @InlineMe(replacement = "x") @Deprecated public static Object c9(String s, String... xs) { return Arrays.asList(xs); }
  @InlineMe(replacement = "x") @Deprecated public static Object c10(String s, String... xs) { return String.format(s, xs); }
  @InlineMe(replacement = "x") @Deprecated public static Object c11(String s, String... xs) { return String.format(s, (Object[]) xs); }
  @InlineMe(replacement = "x") @Deprecated public static Object c12(String s, String... xs) { return String.format(s, (Object) xs); }
  @InlineMe(replacement = "x") @Deprecated public static Object c13(String s, String... xs) { return String.format(s, new Object[] { xs }); }
  @InlineMe(replacement = "x") @Deprecated public static Object c14(String s, String... xs) { return Arrays.asList(xs, xs); }
  @InlineMe(replacement = "x") @Deprecated public static Object c15(String s, String... xs) { return Arrays.asList(s, xs); }
  @InlineMe(replacement = "x") @Deprecated public static Object c16(String s, String... xs) { return foo(Arrays.asList(xs)); }
  @InlineMe(replacement = "x") @Deprecated public static Object c17(String s, String... xs) { return new ArrayList<>(Arrays.asList(xs)); }
  @InlineMe(replacement = "x") @Deprecated public static Object c18(String s, String... xs) { return new Foo(xs); }
  @InlineMe(replacement = "x") @Deprecated public static Object c19(String s, String... xs) { return xs[0]; }
  @InlineMe(replacement = "x") @Deprecated public static Object c20(String s, String... xs) { return s + xs.length; }
  @InlineMe(replacement = "x") @Deprecated public static Object c21(String s, String... xs) { return Arrays.asList(xs).get(0); }
  @InlineMe(replacement = "x") @Deprecated public static Object c22(String s, String... xs) { return Arrays.asList((xs)); }
  @InlineMe(replacement = "x") @Deprecated public static Object c23(String s, String... xs) { return Arrays.asList(); }
  @InlineMe(replacement = "x") @Deprecated public static Object c24(String s, String... xs) { return Arrays.asList(s, xs.clone()); }
  @InlineMe(replacement = "x") @Deprecated public static Object c25(String s, String... xs) { return Arrays.<String>asList(xs); }
  @InlineMe(replacement = "x") @Deprecated public static Object c26(String s, String... xs) { return xs == null ? 1 : 2; }
  @InlineMe(replacement = "x") @Deprecated public static Object c27(String s, String... xs) { return new Object() { Object q = xs; }; }
  @InlineMe(replacement = "x") @Deprecated public static Object c28(String s, String... xs) { return (Runnable) () -> { Arrays.asList(xs, 1); }; }
  @InlineMe(replacement = "x") @Deprecated public static Object c29(String... xs) { return Arrays.asList(xs).stream().map(q -> q + xs).toList(); }
  @InlineMe(replacement = "x") @Deprecated public static Object c30(String... xs) { return Arrays.asList(xs).stream().map(q -> q + 1).toList(); }
  static Object foo(Object o) { return o; }
  public static class Foo { public Foo(String... xs) {} }
}
