

import com.google.errorprone.annotations.FormatMethod;
import com.google.errorprone.annotations.FormatString;

public class F43Fa11 {
  @FormatMethod
  public F43Fa11(String s, Object... args) {}

  public static void createTestCase(String s, Object arg) {
    // BUG: Diagnostic contains: Format strings must be compile time constants or
    new F43Fa11(s, arg);
  }
}
