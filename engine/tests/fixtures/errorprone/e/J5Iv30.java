import com.google.errorprone.annotations.InlineMe;

public final class J5Iv30 {
  private String name;

  @InlineMe(replacement = "this.name = name;")
  @Deprecated
  // BUG: Diagnostic contains: deprecated or less visible API elements: this.name
  public void setName(String name) {
    this.name = name;
  }
}

