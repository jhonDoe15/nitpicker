import com.google.errorprone.annotations.InlineMe;

public final class J5Iv35 {
  @Deprecated
  @InlineMe(replacement = "this.after(inputs)")
  // BUG: Diagnostic contains: varargs
  public void before(int... inputs) {
    after(inputs);
  }

  public void after(int[] inputs) {}
}

