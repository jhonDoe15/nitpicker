

import com.google.errorprone.annotations.FormatMethod;
import com.google.errorprone.annotations.FormatString;

public class F43Fa5 {
  @FormatMethod
  public static void log(@FormatString String s, Object... args) {}

  public static void callLog() {
    final String formatString = "%d";
    log(formatString, Integer.valueOf(0));
  }
}
