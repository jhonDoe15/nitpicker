package ivra;
import com.google.errorprone.annotations.InlineMe;
import java.util.*;
import java.util.function.*;

public class RaE {
  private int p1() { return 1; }
  private int p2(int x) { return 1; }
  private static int sp(int x) { return 1; }
  private int pfld;
  private static class PT { static int PQ; public PT() {} public PT(Object o) {} public int[] arr = new int[1]; public PT next; private PT pnext; public static PT make() { return null; } public PT self() { return this; } public int priv2() { return 1; } private int priv3() { return 1; }}
  int[] parr = new int[2];
  public PT pub;
  @InlineMe(replacement = "x") @Deprecated public Object a1() { return p2(p1()); }
  @InlineMe(replacement = "x") @Deprecated public Object a2() { return foo(p1(), p2(1)); }
  @InlineMe(replacement = "x") @Deprecated public Object a3() { return foo(p2(1), p1()); }
  @InlineMe(replacement = "x") @Deprecated public Object a4() { return this.p1() + this.pfld; }
  @InlineMe(replacement = "x") @Deprecated public Object a5() { return this.pfld + this.p1(); }
  @InlineMe(replacement = "x") @Deprecated public Object a6() { return pub.next.pnext; }
  @InlineMe(replacement = "x") @Deprecated public Object a7() { return pub.pnext.next; }
  @InlineMe(replacement = "x") @Deprecated public Object a8() { return pub.next.next; }
  @InlineMe(replacement = "x") @Deprecated public Object a9() { return new PT(p1()); }
  @InlineMe(replacement = "x") @Deprecated public Object a10() { return new PT(sp(p1())); }
  @InlineMe(replacement = "x") @Deprecated public Object a11() { return PT.make().self().priv3(); }
  @InlineMe(replacement = "x") @Deprecated public Object a12() { return PT.make().priv3(); }
  @InlineMe(replacement = "x") @Deprecated public Object a13() { return parr[p1()]; }
  @InlineMe(replacement = "x") @Deprecated public Object a14() { return parr[0] + p1(); }
  @InlineMe(replacement = "x") @Deprecated public Object a15() { return new int[p1()]; }
  @InlineMe(replacement = "x") @Deprecated public Object a16() { return (Object) p1(); }
  @InlineMe(replacement = "x") @Deprecated public Object a17() { return (PT) null; }
  @InlineMe(replacement = "x") @Deprecated public Object a18() { return -p1(); }
  @InlineMe(replacement = "x") @Deprecated public Object a19() { return (p1()); }
  @InlineMe(replacement = "x") @Deprecated public Object a20() { return (Supplier<Integer>) () -> p1(); }
  @InlineMe(replacement = "x") @Deprecated public Object a21() { return (Supplier<Integer>) this::p1; }
  @InlineMe(replacement = "x") @Deprecated public Object a22() { return (Function<Integer,Integer>) RaE::sp; }
  @InlineMe(replacement = "x") @Deprecated public Object a23() { return PT.PQ + p1(); }
  @InlineMe(replacement = "x") @Deprecated public Object a24() { return p1() + PT.PQ; }
  @InlineMe(replacement = "x") @Deprecated public Object a25() { return RaE.PT.PQ; }
  @InlineMe(replacement = "x") @Deprecated public Object a26() { return ivra.RaE.PT.PQ; }
  @InlineMe(replacement = "x") @Deprecated public Object a27() { return ivra.RaE.PT.make(); }
  @InlineMe(replacement = "x") @Deprecated public Object a28() { return RaE.PT.make().priv2(); }
  @InlineMe(replacement = "x") @Deprecated public Object a29() { return Collections.<PT>emptyList(); }
  @InlineMe(replacement = "x") @Deprecated public Object a30() { return new RaE().<PT>gen(); }
  @InlineMe(replacement = "x") @Deprecated public Object a31() { return new HashMap<String, List<PT>>(); }
  @InlineMe(replacement = "x") @Deprecated public Object a32() { return new HashMap<String, List<? extends PT>>(); }
  @InlineMe(replacement = "x") @Deprecated public Object a33() { return new PT[] { null }; }
  @InlineMe(replacement = "x") @Deprecated public Object a34() { return new PT[1][2]; }
  @InlineMe(replacement = "x") @Deprecated public Object a35() { return (List<PT>[]) null; }
  @InlineMe(replacement = "x") @Deprecated public Object a36() { return p1() > 0 && p2(1) > 0; }
  @InlineMe(replacement = "x") @Deprecated public Object a37() { return pfld++ + p1(); }
  @InlineMe(replacement = "x") @Deprecated public Object a38() { return java.util.List.of(p1()); }
  @InlineMe(replacement = "x") @Deprecated public Object a39() { return java.util.List.of(); }
  @InlineMe(replacement = "x") @Deprecated public Object a40() { return ((RaE) this).p1(); }
  @InlineMe(replacement = "x") @Deprecated public Object a41() { return new RaE().new Inn(); }
  @InlineMe(replacement = "x") @Deprecated public Object a42() { return this.new Inn(); }
  @InlineMe(replacement = "x") @Deprecated public Object a43() { return new Inn(); }
  @InlineMe(replacement = "x") @Deprecated public Object a44() { return new PInn(); }
  @InlineMe(replacement = "x") @Deprecated public Object a45() { return this.new PInn(); }
  @InlineMe(replacement = "x") @Deprecated public Object a46() { return new RaE().new PInn(p1()); }
  @InlineMe(replacement = "x") @Deprecated public Object a47(String s) { return s.length() + p1(); }
  @InlineMe(replacement = "x") @Deprecated public Object a48(String s) { return p1() + s.length(); }
  @InlineMe(replacement = "x") @Deprecated public Object a49(RaE s) { return s.p1() + s.pub.priv2(); }
  @InlineMe(replacement = "x") @Deprecated public Object a50(RaE s) { return s.pub.priv2() + s.p1(); }
  @InlineMe(replacement = "x") @Deprecated public Object a51(RaE s) { return s.pub.priv2() + s.pub.priv3(); }
  @InlineMe(replacement = "x") @Deprecated public Object a52(RaE s) { return foo(s.pub.priv3(), s.pub.priv3()); }
  <U> U gen() { return null; }
  class Inn {}
  private class PInn { PInn() {} PInn(int x) {} }
  static Object foo(Object... o) { return o; }
  // statements
  @InlineMe(replacement = "x") @Deprecated public void s1() { assert true; }
  @InlineMe(replacement = "x") @Deprecated public void s2() { class L {} }
  @InlineMe(replacement = "x") @Deprecated public void s3() { l: foo(1); }
  @InlineMe(replacement = "x") @Deprecated public void s4() { for (;;) {} }
  @InlineMe(replacement = "x") @Deprecated public void s5() { do { } while (false); }
  @InlineMe(replacement = "x") @Deprecated public int s6() { return switch (1) { default -> 1; }; }
  @InlineMe(replacement = "x") @Deprecated public void s7() { switch (1) { default: } }
  @InlineMe(replacement = "x") @Deprecated public void s8() { try { foo(1); } finally { } }
  @InlineMe(replacement = "x") @Deprecated public void s9() { ;; }
  @InlineMe(replacement = "x") @Deprecated public void s10() { foo(1);; }
  @InlineMe(replacement = "x") @Deprecated public void s11() { ; foo(1); }
  @InlineMe(replacement = "x") @Deprecated public void s12() { foo(1) /* c */ ; }
  @InlineMe(replacement = "x") @Deprecated public void s13() { // c
    foo(1); }
  @InlineMe(replacement = "x") @Deprecated public int s14() { return (1); }
  @InlineMe(replacement = "x") @Deprecated public int s15() { return /* c */ 1; }
  @InlineMe(replacement = "x") @Deprecated public int s16() { return 1 /* c */ ; }
  @InlineMe(replacement = "x") @Deprecated public void s17() { new Object(); }
}
