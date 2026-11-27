import com.google.errorprone.annotations.InlineMe;
import java.util.function.Supplier;

public final class J5Iv9 {
  @InlineMe(replacement = "this.after(() -> string);")
  @Deprecated
  // BUG: Diagnostic contains: evaluation timing
  public void before(String string) {
    after(() -> string);
  }

  public void after(Supplier<String> supplier) {}
}

