package iv1;
import com.google.errorprone.annotations.InlineMe;
public final class Iv1Super extends Iv1Base {
  @InlineMe(replacement = "super.base()")
  public final int other() { return super.base(); }
  @InlineMe(replacement = "Iv1Super.class.getName()", imports = "iv1.Iv1Super")
  public final String name() { return Iv1Super.class.getName(); }
  @InlineMe(replacement = "(Nested) o", imports = "iv1.Iv1Super")
  public final Nested cast(Object o) { return (Nested) o; }
  @InlineMe(replacement = "Iv1Super.K + y", imports = "iv1.Iv1Super")
  public final int k(int y) { return K + y; }
  @InlineMe(replacement = "new Nested()", imports = "iv1.Iv1Super.Nested")
  public final Nested make() { return new Nested(); }
  static final int K = 3;
  public static class Nested {}
}
class Iv1Base { public int base() { return 1; } }
