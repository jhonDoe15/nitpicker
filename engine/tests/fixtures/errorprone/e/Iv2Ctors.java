package iv2;
import com.google.errorprone.annotations.InlineMe;
public enum Iv2Ctors {
  A(1);
  @InlineMe(replacement = "this(i, 0)")
  Iv2Ctors(int i) { this(i, 0); }
  Iv2Ctors(int i, int j) {}
  public record R(int a) {
    @InlineMe(replacement = "this(0)")
    public R(String s) { this(0); }
  }
  static class Anon {
    Object o = new Object() {
      @InlineMe(replacement = "this.toString()")
      public String s() { return toString(); }
    };
    @InlineMe(replacement = "this.h(b)")
    final void v(int... b) { h(b); }
    void h(int... b) {}
    @InlineMe(replacement = "this.k(1, b)")
    final void w(int... b) { k(1, b); }
    void k(int a, int[] b) {}
  }
  public static class Sup extends Base {
    @InlineMe(replacement = "super.f()")
    final void call() { super.f(); }
    @InlineMe(replacement = "Sup.this.toString()")
    public final String outer() { return Sup.this.toString(); }
  }
  static class Base { void f() {} }
}
