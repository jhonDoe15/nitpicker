import com.google.errorprone.annotations.InlineMe;

public final class J5Iv15 {
  public final String str = null;

  @InlineMe(replacement = "this.str")
  @Deprecated
  public String before() {
    return str;
  }
}

