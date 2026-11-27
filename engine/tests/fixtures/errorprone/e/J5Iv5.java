import com.google.errorprone.annotations.InlineMe;
import java.util.function.Supplier;

public final class J5Iv5 {
  @InlineMe(replacement = "this.after(string)")
  @Deprecated
  public void before(String string) {
    after(/* string= */ string);
  }

  public void after(String string) {}
}

