import com.google.errorprone.annotations.InlineMe;

public final class J5Iv24 {
  @InlineMe(replacement = "")
  @Deprecated
  // BUG: Diagnostic contains: only inline methods with exactly 1 statement
  public void setDeadline(org.joda.time.Duration deadline) {}
}
