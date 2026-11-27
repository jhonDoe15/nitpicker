import com.google.errorprone.annotations.InlineMe;
import java.time.Duration;

public final class J5Iv4 {
  @InlineMe(
      replacement = "new Duration[size]",
      imports = {"java.time.Duration"})
  @Deprecated
  public static Duration[] someDurations(int size) {
    return new Duration[size];
  }
}

