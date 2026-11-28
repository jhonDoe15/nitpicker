package iv1;
import com.google.errorprone.annotations.InlineMe;
import com.google.errorprone.annotations.InlineMeValidationDisabled;
public final class Iv1Vis {
  @InlineMe(replacement = "this.prot()")
  public void a() { prot(); }
  protected void prot() {}
  @InlineMe(replacement = "this.dep()")
  public void b() { dep(); }
  @Deprecated public void dep() {}
  @InlineMe(replacement = "this.pkg(this.prot2())")
  protected void c() { pkg(prot2()); }
  void pkg(int i) {}
  protected int prot2() { return 1; }
  @InlineMeValidationDisabled("x")
  @InlineMe(replacement = "nonsense")
  public void d() { prot(); }
  @SuppressWarnings("InlineMeValidator")
  @InlineMe(replacement = "nonsense")
  public void e() { prot(); }
  @InlineMe(replacement = "this.f2(0x10, 1_000L, 'a', \"\\u0041\")")
  public void f() { f2(16, 1000L, 'a', "A"); }
  void f2(int a, long b, char c, String d) {}
  @InlineMe(replacement = "this.f2(16,   1000L , 'a', \"A\")  /* c */")
  public void g() { f2(16, 1000L, 'a', "A"); }
  @InlineMe(replacement = "this." + "h2()")
  public void h() { h2(); }
  public void h2() {}
  private static final String R = "this.h2()";
  @InlineMe(replacement = R, imports = {"b.B", "a.A", "b.B"})
  public void i() { h2(); }
}
