import static java.time.Duration.ZERO;

import com.google.errorprone.annotations.InlineMe;
import java.time.Duration;

public final class J5Iv26 {
  @InlineMe(
      replacement = "this.after(ZERO)",
      staticImports = {"java.time.Duration.ZERO"})
  @Deprecated
  public void before() {
    after(ZERO);
  }

  public void after(Duration duration) {}
}
