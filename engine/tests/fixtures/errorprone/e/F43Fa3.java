

import com.google.errorprone.annotations.FormatMethod;
import com.google.errorprone.annotations.FormatString;

public class F43Fa3 {
  @FormatMethod
  public static void log(@FormatString String s, Object... args) {}

  @FormatMethod
  public static void callLog(String s, Object arg) {
    log(s, arg);
  }
}
