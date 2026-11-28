

import com.google.errorprone.annotations.InlineMe;

public final class J5Iv27 {
  @Deprecated
  @InlineMe(
      replacement = "J5Iv27.after()",
      imports = {"com.google.foo.Client"})
  public static <T> T before() {
    return after();
  }

  public static <T> T after() {
    return (T) null;
  }
}

