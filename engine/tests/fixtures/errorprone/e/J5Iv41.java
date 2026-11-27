

import com.google.errorprone.annotations.InlineMe;

public final class J5Iv41 {
  public record SomeRecord(long id) {
    @InlineMe(replacement = "this.id()")
    public long getId() {
      return id();
    }
  }
}
