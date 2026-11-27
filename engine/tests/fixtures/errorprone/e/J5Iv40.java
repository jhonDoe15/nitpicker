import com.google.errorprone.annotations.InlineMe;

public final class J5Iv40 {
  @Deprecated
  @InlineMe(replacement = "this.after(arg0, arg1)")
  // BUG: Diagnostic contains: `arg[0-9]+`
  public void before(int arg0, int arg1) {
    after(arg0, arg1);
  }

  public void after(int arg0, int arg1) {}
}
