import com.google.errorprone.annotations.InlineMe;

public final class J5Iv36 {
  @Deprecated
  @InlineMe(replacement = "return")
  // BUG: Diagnostic contains: InlineMe cannot yet be applied to no-op void methods
  public void noOp() {
    return;
  }
}

