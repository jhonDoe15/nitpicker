import com.google.errorprone.annotations.InlineMe;

public final class J5Iv32 {
  @SuppressWarnings("InlineMeValidator")
  @Deprecated
  @InlineMe(replacement = "J5Iv32.create()", imports = "foo.Client")
  // BUG: Diagnostic contains: cannot be applied
  public J5Iv32() {}

  public static J5Iv32 create() {
    return new J5Iv32();
  }
}

