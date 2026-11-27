

import com.google.errorprone.annotations.FormatMethod;
import com.google.errorprone.annotations.FormatString;

public class F43Fa8 {
  @FormatMethod
  public static void log(@FormatString String s, Object... args) {}

  @FormatMethod
  public static void callLog1(String format, String s, Object arg) {
    // BUG: Diagnostic contains: Format strings must be compile time constants or
    log(s, arg);
  }

  @FormatMethod
  public static void callLog2(String s, @FormatString String format, Object arg) {
    // BUG: Diagnostic contains: Format strings must be compile time constants or
    log(s, arg);
  }
}
