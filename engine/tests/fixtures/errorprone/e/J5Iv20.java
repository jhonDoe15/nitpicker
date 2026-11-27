import com.google.errorprone.annotations.InlineMe;

public final class J5Iv20 {
  @InlineMe(replacement = "this.setDeadline(java.time.Duration.ofMillis(millis))")
  @Deprecated
  public void setDeadlineInMillis(long millis) {
    this.setDeadline(java.time.Duration.ofMillis(millis));
  }

  public void setDeadline(java.time.Duration deadline) {}
}

