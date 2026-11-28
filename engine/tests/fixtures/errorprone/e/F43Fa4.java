

import com.google.errorprone.annotations.FormatMethod;
import com.google.errorprone.annotations.FormatString;

public class F43Fa4 {
  @FormatMethod
  public static void log(@FormatString String s, Object... args) {}

  public static void callLog() {
    // BUG: Diagnostic contains: extra format arguments: used 1, provided 2
    log("%s", new Object(), new Object());
  }
}
