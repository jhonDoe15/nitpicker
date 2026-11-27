import com.google.errorprone.annotations.InlineMe;
import java.time.Duration;

public final class J5Iv25 {
  @InlineMe(
      replacement = "this.after(Duration.ZERO)",
      imports = {"java.time.Duration"})
  @Deprecated
  public void before() {
    after(Duration.ZERO);
  }

  public void after(Duration duration) {}
}

