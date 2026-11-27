import static com.google.common.flogger.LazyArgs.lazy;

import com.google.common.flogger.FluentLogger;

class F43Fl4 {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();

  public void f(String s, Integer i) {
    // BUG: Diagnostic contains: 'java.lang.String'
    logger.atInfo().log("hello %d", lazy(() -> s));
    logger.atInfo().log("hello %d", lazy(() -> i));
  }
}
