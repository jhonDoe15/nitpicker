

import com.google.errorprone.annotations.FormatMethod;

public class F43Fa6 {
  @FormatMethod
  static void log(String s, Object... args) {}

  public static String formatString() {
    return "";
  }

  public static void callLog() {
    String format = "log: ";
    // BUG: Diagnostic contains: Format strings must be either literals or
    log(format + 3);
    // BUG: Diagnostic contains: Format strings must be either literals or
    log(formatString());
  }
}
