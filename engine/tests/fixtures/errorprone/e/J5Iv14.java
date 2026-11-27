import com.google.errorprone.annotations.InlineMe;

public final class J5Iv14 {
  private final String str = null;

  @InlineMe(replacement = "str;")
  @Deprecated
  // BUG: Diagnostic contains: deprecated or less visible API elements: str
  public String before() {
    return str;
  }
}

