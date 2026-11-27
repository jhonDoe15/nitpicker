package iv1;
import com.google.errorprone.annotations.InlineMe;
public abstract class Iv1Over {
  @InlineMe(replacement = "this.g()")
  public void f() { g(); }
  public void g() {}
  @InlineMe(replacement = "this.g()")
  public abstract void abs();
  interface I {
    @InlineMe(replacement = "this.h()")
    default void d() { h(); }
    void h();
    @InlineMe(replacement = "I.s2()", imports = "iv1.Iv1Over.I")
    static void s() { s2(); }
    static void s2() {}
  }
  enum E {
    A;
    @InlineMe(replacement = "this.name()")
    public String n() { return name(); }
  }
  record R(int x) {
    @InlineMe(replacement = "this.x()")
    public int y() { return x(); }
  }
  @InlineMe(replacement = "this.g()")
  private void priv() { g(); }
  @InlineMe(replacement = "this.v(a, b)")
  public final void va(int a, int... b) { v(a, b); }
  public void v(int a, int... b) {}
  @InlineMe(replacement = "this.v(b.length)")
  public final void vb(int... b) { v(b.length); }
  @InlineMe(replacement = "this.v(a + a)")
  public final void twice(int a) { v(a + a); }
  @InlineMe(replacement = "this.v(arg0)")
  public final void argn(int arg0) { v(arg0); }
  @InlineMe(replacement = "java.util.Optional.empty().orElseGet(() -> a)")
  public final Object lam(Object a) { return java.util.Optional.empty().orElseGet(() -> a); }
}
