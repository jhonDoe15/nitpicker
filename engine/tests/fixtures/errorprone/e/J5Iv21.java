import com.google.errorprone.annotations.InlineMe;

public final class J5Iv21 {
  @Deprecated
  @InlineMe(replacement = "this.after(String.valueOf(value))")
  public void before(long value) {
    after(String.valueOf(value));
  }

  public void after(String string) {}
}

