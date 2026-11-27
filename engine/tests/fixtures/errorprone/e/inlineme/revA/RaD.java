package ivra;
import com.google.errorprone.annotations.InlineMe;
import java.util.*;
import java.util.function.*;
import ivpb.Base;
import static ivpb.Base.old;
import static ivpb.Base.CONST;


public class RaD extends Base implements Base.I {
  public void im() {}
  public void oldim() {}
  public record Rec(int a, int b) {
    @InlineMe(replacement = "x") @Deprecated public Rec { foo(a); }
    static Object foo(Object o) { return o; }
  }
  public record Rec3(int a, int b) {
    @InlineMe(replacement = "x") @Deprecated public Rec3 { }
  }
  public record Rec4(int a, int b) {
    @InlineMe(replacement = "x") @Deprecated public Rec4 { Rec3.class.hashCode(); }
  }
  public record Rec5(int a, int b) {
    @InlineMe(replacement = "x") @Deprecated public Rec5 { a = 1; }
  }
  public record Rec6(int a, int b) {
    @InlineMe(replacement = "x") @Deprecated public Rec6 { this.getClass(); }
  }
  public record Rec7(int a, int b) {
    @InlineMe(replacement = "x") @Deprecated public static Object s() { return new Rec7(1, 2); }
    @InlineMe(replacement = "x") @Deprecated public Object t() { return a; }
    @InlineMe(replacement = "x") @Deprecated public Object u() { return b(); }
    @InlineMe(replacement = "x") @Deprecated public Object v() { return this.a; }
    @InlineMe(replacement = "x") @Deprecated public Object w() { return new Rec7(a, 1); }
    @InlineMe(replacement = "x") @Deprecated public Object y(int z) { return z + a; }
    @InlineMe(replacement = "x") @Deprecated public Object y2(int a) { return a; }
  }
  @InlineMe(replacement = "x") @Deprecated public Object a1() { return px; }
  @InlineMe(replacement = "x") @Deprecated public Object a2() { return this.px; }
  @InlineMe(replacement = "x") @Deprecated public Object a3() { return psx; }
  @InlineMe(replacement = "x") @Deprecated public Object a4() { return Base.psx; }
  @InlineMe(replacement = "x") @Deprecated public Object a5() { return pub; }
  @InlineMe(replacement = "x") @Deprecated protected Object a6() { return px; }
  @InlineMe(replacement = "x") @Deprecated public Object a7() { return pm(); }
  @InlineMe(replacement = "x") @Deprecated public Object a8() { return Base.psm(); }
  @InlineMe(replacement = "x") @Deprecated public Object a9() { return old(); }
  @InlineMe(replacement = "x") @Deprecated public Object a10() { return CONST; }
  @InlineMe(replacement = "x") @Deprecated public Object a11() { return Base.CONST; }
  @InlineMe(replacement = "x") @Deprecated public Object a12() { return new PNested(); }
  @InlineMe(replacement = "x") @Deprecated public Object a13() { return PNested.Q; }
  @InlineMe(replacement = "x") @Deprecated public Object a14() { return K; }
  @InlineMe(replacement = "x") @Deprecated public Object a15() { return I.K; }
  @InlineMe(replacement = "x") @Deprecated public Object a16() { return Base.I.K; }
  @InlineMe(replacement = "x") @Deprecated public Object a17() { return oldI(); }
  @InlineMe(replacement = "x") @Deprecated public Object a18() { return this.oldI(); }
  @InlineMe(replacement = "x") @Deprecated public Object a19() { return super.oldI(); }
  @InlineMe(replacement = "x") @Deprecated public Object a20() { return super.pub; }
  @InlineMe(replacement = "x") @Deprecated public Object a21() { return Base.old(); }
  @InlineMe(replacement = "x") @Deprecated public Object a22() { return new Base(1) {}; }
  @InlineMe(replacement = "x") @Deprecated public Object a24() { return (Runnable) Base::old; }
  @InlineMe(replacement = "x") @Deprecated public Object a25() { return (Runnable) this::oldI; }
  @InlineMe(replacement = "x") @Deprecated public Object a26() { return (Function<Integer, Integer>) (Integer q) -> q; }
  @InlineMe(replacement = "x") @Deprecated public Object a27() { return (Function<Base.PNested, Integer>) (Base.PNested q) -> 1; }
  @InlineMe(replacement = "x") @Deprecated public Object a28() { return (Function<Object, Integer>) (q) -> q.hashCode(); }
  @InlineMe(replacement = "x") @Deprecated public Object a29() { return new Integer(1); }
  @InlineMe(replacement = "x") @Deprecated public Object a30() { return new Observable(); }
  @InlineMe(replacement = "x") @Deprecated public Object a31() { return Thread.currentThread().getId(); }
  @InlineMe(replacement = "x") @Deprecated public Object a32() { return new Object().hashCode(); }
  @InlineMe(replacement = "x") @Deprecated public Object a33(Object o) { return o.getClass(); }
  @InlineMe(replacement = "x") @Deprecated public Object a34(int[] o) { return o.clone(); }
  @InlineMe(replacement = "x") @Deprecated public Object a35(int[] o) { return o.length; }
  @InlineMe(replacement = "x") @Deprecated public Object a36(List<int[]> o) { return o.get(0).length; }
  @InlineMe(replacement = "x") @Deprecated public Object a38(Object o) { return Objects.requireNonNull(o); }
  @InlineMe(replacement = "x") @Deprecated public <U extends Comparable<U>> Object a39(U a, U b) { return a.compareTo(b); }
  @InlineMe(replacement = "x") @Deprecated public Object a40(Map.Entry<String, String> e) { return e.getKey(); }
  @InlineMe(replacement = "x") @Deprecated public Object a41(Object e) { return new AbstractMap.SimpleEntry<String, String>("a", "b"); }
  @InlineMe(replacement = "x") @Deprecated public Object a42(Object e) { return java.util.concurrent.TimeUnit.SECONDS; }
  @InlineMe(replacement = "x") @Deprecated public Object a43(Object e) { return Locale.US; }
  @InlineMe(replacement = "x") @Deprecated public Object a44(Object e) { return java.lang.Thread.State.NEW; }
  @InlineMe(replacement = "x") @Deprecated public Object a47(Object e) throws Exception { return Runtime.getRuntime().exec("x"); }
  @InlineMe(replacement = "x") @Deprecated public Object a48(Object e) { return Character.isSpace('x'); }
  @InlineMe(replacement = "x") @Deprecated public Object a49(Object e) { return java.net.URLEncoder.encode("x"); }
  @InlineMe(replacement = "x") @Deprecated public Object a50(Object e) { return java.net.URLEncoder.encode("x", java.nio.charset.StandardCharsets.UTF_8); }
  @InlineMe(replacement = "x") @Deprecated public Object a51(Object e) { return System.getSecurityManager(); }
  @InlineMe(replacement = "x") @Deprecated public Object a52(Object e) { return Optional.empty().orElseThrow(IllegalStateException::new); }
  @InlineMe(replacement = "x") @Deprecated public Object a53(Object e) { return java.util.Map.Entry.comparingByKey(); }
  @InlineMe(replacement = "x") @Deprecated public Object a54(Object e) { return e.toString(); }

  public Object lc() {
    class Loc {
      @InlineMe(replacement = "x") @Deprecated public int e1(int a) { return a; }
      @InlineMe(replacement = "x") @Deprecated public final int e2(int a) { return a; }
    }
    return new Loc();
  }
  Object fld = new Object() { @InlineMe(replacement = "x") @Deprecated public int e1(int a) { return a; } };
  public enum E2 {
    A { @InlineMe(replacement = "x") @Deprecated public int e1(int a) { return a; } },
    B;
    @InlineMe(replacement = "x") @Deprecated public int e2(int a) { return a; }
  }
  public enum E3 { A, B; public static class Nested { @InlineMe(replacement = "x") @Deprecated public int e1(int a) { return a; } } }
  public enum E4 { A { void z() {} }; public static class Nested { @InlineMe(replacement = "x") @Deprecated public int e1(int a) { return a; } } }
  public sealed interface SI permits SC { @InlineMe(replacement = "x") @Deprecated default int e1(int a) { return a; } }
  public static final class SC implements SI { @InlineMe(replacement = "x") @Deprecated public int e1(int a) { return a; } }
  public sealed static class SS permits SS2 {  @InlineMe(replacement = "x") @Deprecated public int e1(int a) { return a; } }
  public static final class SS2 extends SS {}
  @interface An { @InlineMe(replacement = "x") @Deprecated int q() default 1; }
}
