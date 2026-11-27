import com.google.errorprone.annotations.InlineMe;
import java.time.Duration;

public final class J5Iv19 {
  @InlineMe(replacement = "this.setDeadline(Duration.ofMillis(millis))")
  @Deprecated
  // BUG: Diagnostic matches: BAR
  public void setDeadlineInMillis(long millis) {
    this.setDeadline(Duration.ofMillis(millis));
  }

  public void setDeadline(Duration deadline) {}
}

