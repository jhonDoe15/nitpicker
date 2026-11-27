

import com.google.errorprone.annotations.FormatMethod;

public class F43Fa14 {
  @FormatMethod
  // BUG: Diagnostic contains: must contain at least one String parameter
  public static void log(int x, int y) {}

  void test() {
    log(1, 2);
  }
}
