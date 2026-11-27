package p;
import java.io.File;
import q.L;
public class X {
  interface I { String get(String s); }
  static abstract class A { abstract String get(); String conc() { return "c"; } }
  static class B extends A { String get() { return "b"; } }
  private final String finCtor;
  private static final String SMETH = L.k();
  private final String finParam;
  X(String p) { finCtor = "c"; finParam = p; }
  public void d1() { new File(L.k()); }
  public void d2(String s) { new File(L.p(s)); }
  public void d3(String s) { new File(L.c(s)); }
  public void d4() { new File(L.c("x")); }
  public void d5(L l) { new File(l.m()); }
  public void d6() { new File(new L().m()); }
  public void d7(L l, String s) { new File(l.n(s)); }
  public void d8() { new File(new L().n("x")); }
  public void d9() { new File(String.valueOf(L.len("x"))); }
  public void d10() { new File((String) L.obj("x")); }
  public void d11() { new File(L.KONST); }
  public void d12() { new File(L.var); }
  public void d13(I i) { new File(i.get("x")); }
  public void d14(A a) { new File(a.get()); }
  public void d15(A a) { new File(a.conc()); }
  public void d16() { new File(new B().get()); }
  public void d17() { new File(finCtor); }
  public void d18() { new File(SMETH); }
  public void d19() { new File(finParam); }
  public void d20(String s) { new File(L.p("lit")); }
  public void d21(StringBuilder b) { new File(b.toString()); }
  public void d22(String s) { String t = L.p(s); new File(t.trim()); }
  public void d23(String s) { new File(new StringBuilder().append("a").append(1).toString()); }
  public void d24(String s) { new File(new StringBuilder().append("a").append(s.length()).toString()); }
  public void d25(java.util.function.Supplier<String> f) { new File(f.get()); }
  public void d26() { java.util.function.Supplier<String> f = () -> "a"; new File(f.get()); }
  public void d27(Object o) { new File((String) o); }
  public void d28(String s) { Object o = s; new File((String) o); }
  public void d29(String s) { new File(s.isEmpty() ? "a" : s); }
  public void d30(String s) throws Exception { try { new File(s); } catch (RuntimeException e) { new File(e.getMessage()); } }
  public void d31(long n) { new File("" + n); }
  public void d32(char c) { new File("" + c); }
  public void d33(Long n) { new File("" + n); }
  public void d34(boolean b) { new File(Boolean.toString(b)); }
  public void d35(java.util.UUID u) { new File(u.toString()); }
  public void d36(java.nio.file.Path p) { new File(p.toString()); }
  public void d37(File f) { new File(f.getName()); }
  public void d38(File f) { new File(f.getAbsolutePath()); }
}
