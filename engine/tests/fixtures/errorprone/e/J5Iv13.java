import com.google.errorprone.annotations.InlineMe;
import java.util.function.Function;

public final class J5Iv13 {
  @InlineMe(replacement = "this.after(str -> Integer.parseInt(str))")
  @Deprecated
  public void before() {
    after(str -> Integer.parseInt(str));
  }

  public void after(Function<String, Integer> function) {}
}

