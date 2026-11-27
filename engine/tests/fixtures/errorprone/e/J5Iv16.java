import com.google.errorprone.annotations.InlineMe;

public final class J5Iv16 {
  @InlineMe(replacement = "this.privateMethod();")
  @Deprecated
  // BUG: Diagnostic contains: deprecated or less visible API elements: privateMethod()
  public String before() {
    return privateMethod();
  }

  private String privateMethod() {
    return null;
  }
}

