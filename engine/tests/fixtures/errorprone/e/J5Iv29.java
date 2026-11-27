

import com.google.errorprone.annotations.InlineMe;
import java.time.Duration;

public final class J5Iv29 {
  public static final class Builder {
    @InlineMe(
        replacement = "this.setDeadline(J5Iv29.Builder.parseDuration(deadline))",
        imports = {"com.google.frobber.Client"})
    @Deprecated
    public void setDeadline(String deadline) {
      setDeadline(J5Iv29.Builder.parseDuration(deadline));
    }

    public void setDeadline(Duration deadline) {}

    public static Duration parseDuration(String string) {
      return Duration.parse(string);
    }
  }
}

