import com.google.errorprone.annotations.InlineMe;

public final class J5Iv11 {
  @InlineMe(replacement = "this.after(x > 0 ? y : false)")
  @Deprecated
  // BUG: Diagnostic contains: evaluation timing
  public boolean before(int x, boolean y) {
    return after(x > 0 ? y : true);
  }

  public boolean after(boolean b) {
    return !b;
  }
}

