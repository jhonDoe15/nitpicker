package iv1;
import com.google.errorprone.annotations.InlineMe;
public final class Iv1Ctor {
  private int x;
  @InlineMe(replacement = "new Iv1Ctor(x, 0)", imports = "iv1.Iv1Ctor")
  public Iv1Ctor(int x) { this(x, 0); }
  public Iv1Ctor(int x, int y) { this.x = x + y; }
  @InlineMe(replacement = "this.foo()")
  public Iv1Ctor(String s) { foo(); }
  void foo() {}
}
