import com.google.errorprone.annotations.InlineMe;
import java.time.Duration;

public final class J5Iv3 {
  @InlineMe(
      replacement = "new Duration[size]",
      imports = {"java.time.Duration"})
  @Deprecated
  public Duration[] someDurations(int size) {
    return new Duration[size];
  }
}

