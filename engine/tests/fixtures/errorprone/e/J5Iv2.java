

import com.google.errorprone.annotations.InlineMe;

public final class J5Iv2 {
  @InlineMe(replacement = "new J5Iv2()", imports = "com.google.foo.Client")
  @Deprecated
  public static J5Iv2 create() {
    return new J5Iv2();
  }

  public J5Iv2() {}
}

