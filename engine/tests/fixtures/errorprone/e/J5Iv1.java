

import com.google.errorprone.annotations.InlineMe;

public final class J5Iv1 {
  @InlineMe(
      replacement = "new J5Iv1()",
      imports = {"com.google.foo.Client"})
  @Deprecated
  public static J5Iv1 create() {
    return new J5Iv1();
  }

  public J5Iv1() {}
}

