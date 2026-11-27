package ivra;
import com.google.errorprone.annotations.InlineMe;
import com.google.errorprone.annotations.InlineMeValidationDisabled;
import java.util.*;
import java.util.function.*;

public class RaA {
  int f; static int sf; protected int pf; private int privf;
  public RaA() {}
  public RaA(int a) {}
  @InlineMe(replacement = "x") @Deprecated public RaA(String s) {}
  @InlineMe(replacement = "x") @Deprecated public RaA(long l) { this(); }
  @InlineMe(replacement = "x") @Deprecated public RaA(char l) { super(); }
  @InlineMe(replacement = "x") @Deprecated public RaA(short l) { this.f = 1; }
  @InlineMe(replacement = "x") @Deprecated public RaA(byte l) { this(l, 1); }
  @InlineMe(replacement = "x") @Deprecated public RaA(byte l, int z) { this((int) l); }
  @InlineMe(replacement = "x") @Deprecated RaA(float l) { this(); }
  @InlineMe(replacement = "x") @Deprecated private RaA(boolean l) { this(); }
  @InlineMe(replacement = "x") @Deprecated public RaA(Object o, Object p) { this(o.hashCode() + p.hashCode()); }
  @InlineMe(replacement = "x") @Deprecated public RaA(List<String> o) { this(o.size()); ; }
  @InlineMe(replacement = "x") @Deprecated public RaA(Set<String> o) { ; }
  @InlineMe(replacement = "x") @Deprecated public RaA(Map<String,String> o) { this(o.size()); }

  @InlineMe(replacement = "x") @Deprecated public void m1() { ; }
  @InlineMe(replacement = "x") @Deprecated public void m2() { }
  @InlineMe(replacement = "x") @Deprecated public int m3() { return 1; }
  @InlineMe(replacement = "x") @Deprecated public void m4() { return; }
  @InlineMe(replacement = "x") @Deprecated public void m5() { int a = 1; }
  @InlineMe(replacement = "x") @Deprecated public void m6() { if (f > 0) m2(); }
  @InlineMe(replacement = "x") @Deprecated public void m7() { throw new RuntimeException(); }
  @InlineMe(replacement = "x") @Deprecated public void m8() { { m2(); } }
  @InlineMe(replacement = "x") @Deprecated public void m9() { synchronized (this) { m2(); } }
  @InlineMe(replacement = "x") @Deprecated public int m10() { return f; }
  @InlineMe(replacement = "x") @Deprecated public int m11() { return privf; }
  @InlineMe(replacement = "x") @Deprecated public int m12() { return this.privf; }
  @InlineMe(replacement = "x") @Deprecated public int m13() { return pf; }
  @InlineMe(replacement = "x") @Deprecated public int m14() { return new RaA().privf; }
  @InlineMe(replacement = "x") @Deprecated protected int m15() { return pf; }
  @InlineMe(replacement = "x") @Deprecated protected int m16() { return f; }
  @InlineMe(replacement = "x") @Deprecated int m17() { return pf; }
  @InlineMe(replacement = "x") @Deprecated int m18() { return f; }
  @InlineMe(replacement = "x") @Deprecated int m19() { return privf; }
  @InlineMe(replacement = "x") @Deprecated private int m20() { return privf; }
  @InlineMe(replacement = "x") @Deprecated public int m21() { return RaA.sf; }
  @InlineMe(replacement = "x") @Deprecated public int m22() { return sf; }
  @InlineMe(replacement = "x") @Deprecated public int m23() { return privm(); }
  @InlineMe(replacement = "x") @Deprecated public int m24() { return this.privm(); }
  @InlineMe(replacement = "x") @Deprecated public static int m25() { return sprivm(); }
  @InlineMe(replacement = "x") @Deprecated public static int m26() { return RaA.sprivm(); }
  @InlineMe(replacement = "x") @Deprecated public int m27() { return Integer.valueOf(1); }
  @InlineMe(replacement = "x") @Deprecated public Date m28() { return new Date(1, 2, 3); }
  @InlineMe(replacement = "x") @Deprecated public int m29() { return new Date().getYear(); }
  @InlineMe(replacement = "x") @Deprecated public Object m30() { return new Inner(); }
  @InlineMe(replacement = "x") @Deprecated public Object m31() { return new PrivInner(); }
  @InlineMe(replacement = "x") @Deprecated public Object m32() { return new PkgInner(); }
  @InlineMe(replacement = "x") @Deprecated public Object m33() { return new RaA.PrivInner(); }
  @InlineMe(replacement = "x") @Deprecated public Object m34() { return PrivInner.class; }
  @InlineMe(replacement = "x") @Deprecated public Object m35() { return (PrivInner) null; }
  @InlineMe(replacement = "x") @Deprecated public Object m36() { return new ArrayList<PrivInner>(); }
  @InlineMe(replacement = "x") @Deprecated public Object m37() { return new PrivInner[0]; }
  @InlineMe(replacement = "x") @Deprecated public Object m38() { return PrivInner.sm(); }
  @InlineMe(replacement = "x") @Deprecated public Object m39() { return OldThing.X; }
  @InlineMe(replacement = "x") @Deprecated public Object m40() { return OldThing.sm(); }
  @InlineMe(replacement = "x") @Deprecated public Object m41() { return new OldThing(); }
  @InlineMe(replacement = "x") @Deprecated public Object m42() { return java.util.Collections.emptyList(); }
  @InlineMe(replacement = "x") @Deprecated public Object m44() { return foo(new Date().getYear(), new Date(1,2,3)); }
  @InlineMe(replacement = "x") @Deprecated public Object m45() { return OldThing.sm(OldThing.X); }
  @InlineMe(replacement = "x") @Deprecated public Object m46() { return PrivInner.sm(privm()); }
  static Object foo(Object... o) { return o; }
  @InlineMe(replacement = "x") @Deprecated public Object m47() { return privm() + OldThing.X; }
  @InlineMe(replacement = "x") @Deprecated public Object m48() { return new PrivInner().privm2(); }
  @InlineMe(replacement = "x") @Deprecated public Object m49() { return OldThing.Nested.Y; }
  @InlineMe(replacement = "x") @Deprecated public Object m50() { return ivra.OldThing.X; }
  @InlineMe(replacement = "x") @Deprecated public Object m51() { return ivra.OldThing.sm(); }
  @InlineMe(replacement = "x") @Deprecated public Object m52() { return new ivra.OldThing(); }

  private int privm() { return 1; }
  private static int sprivm() { return 1; }
  public static class Inner {}
  private static class PrivInner { static Object sm() { return null; } static Object sm(int x) { return null; } int privm2() { return 1;} }
  static class PkgInner {}
}
