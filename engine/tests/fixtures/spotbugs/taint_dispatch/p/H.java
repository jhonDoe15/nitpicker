package p;
import java.io.File;
import java.util.*;
import javax.servlet.http.*;
public class H {
  static class A { String m(String s) { return "c"; } String n() { return "c"; } }
  static class B extends A { String m(String s) { return s; } String n() { return q.L.k(); } }
  interface I { String k(); default String d() { return "c"; } }
  static class Impl implements I { public String k() { return "c"; } }
  public void i1(A a, HttpServletRequest r) { new File(a.m(r.getParameter("x"))); }
  public void i2(A a) { new File(a.n()); }
  public void i3(B b) { new File(b.n()); }
  public void i4(I i) { new File(i.d()); }
  public void i5(Impl i) { new File(i.k()); }
  public void i6() { new File(F.konst()); }
  public void i7(String s) { new File(F.args("a", "b")); }
  public void i8(String s) { new File(F.args("a", s)); }
  public void i9(String s) { new File(F.gen("a")); }
  public void i10(String s) { new File(F.gen(s)); }
  public void i11(String s) { new File(F.field()); }
  public void i12(String s) { new File(F.sfield()); }
  public void i13(String s) { new File(F.cond(true, s)); }
  public void i14(String s) { new File(F.cond(true, "a")); }
  public void i15(String s) { new File(F.sb("a")); }
  public void i16(String s) { new File(F.sb(s)); }
  public void i17(String s) { new File(F.loop(s)); }
  public void i18(HttpServletRequest r) { new File(F.fromReq(r)); }
  public void i19(String s) { new File(F.ifaceCall(null)); }
  public void i20(String s) { new File(F.indy("a")); }
  public void i21(String s) { new File(F.withTry(s)); }
  public void i22(String s) { new File(F.thrower(s)); }
  public void i23(String s) { new File(F.ret2(s, "b")); }
  public void i24(String s) { new File(new F().inst("a")); }
  public void i25(String s) { new File(F.constArr()[0]); }
  public void i26(String s) { new File(F.konstViaLocal()); }
  public void i27(String s) { List<String> l = F.list(); new File(l.get(0)); }
  public void i28(String s) { new File(F.d0("a")); }
  public void i29(String s) { new File(F.d0(s)); }
}
