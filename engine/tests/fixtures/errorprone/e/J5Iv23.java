import com.google.errorprone.annotations.InlineMe;

public final class J5Iv23 {
  @InlineMe(replacement = "try { int x = 0; } catch (RuntimeException e) {}")
  @Deprecated
  // BUG: Diagnostic contains: InlineMe cannot inline complex statements
  public void before() {
    try {
      int x = 0;
    } catch (RuntimeException e) {
    }
  }
}

