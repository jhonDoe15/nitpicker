

import com.google.errorprone.annotations.FormatMethod;
import com.google.errorprone.annotations.FormatString;

public class F43Fa1 {
  @FormatMethod
  public static void log(@FormatString String s, Object... args) {}

  @FormatMethod
  public static void callLog(@FormatString String s, Object arg, Object arg2) {
    // BUG: Diagnostic contains: The number of format arguments passed with an
    log(s, "test");
    // BUG: Diagnostic contains: The format argument types passed with an
    log(s, "test1", "test2");
  }
}
