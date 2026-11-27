import com.google.errorprone.annotations.InlineMe;
import com.google.errorprone.annotations.InlineMeValidationDisabled;

public final class J5Iv33 {
  @InlineMeValidationDisabled("Migrating to factory method")
  @Deprecated
  @InlineMe(replacement = "J5Iv33.create()", imports = "foo.Client")
  public J5Iv33() {}

  public static J5Iv33 create() {
    return new J5Iv33();
  }
}

