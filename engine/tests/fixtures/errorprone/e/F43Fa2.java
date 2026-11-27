

import com.google.errorprone.annotations.FormatMethod;
import com.google.errorprone.annotations.FormatString;

public class F43Fa2 {
  @FormatMethod
  public static void log(@FormatString String s, Object... args) {}

  @FormatMethod
  public static void callLog(@FormatString String s, Object arg) {
    log(s, arg);
  }
}
