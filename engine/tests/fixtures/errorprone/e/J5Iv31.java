import com.google.errorprone.annotations.InlineMe;

public final class J5Iv31 {
  public String name;

  @InlineMe(replacement = "this.name = name")
  @Deprecated
  public void setName(String name) {
    this.name = name;
  }
}

