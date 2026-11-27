import com.google.common.flogger.FluentLogger;

class F43Fl5 {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();

  public void f(Object... xs) {
    // BUG: Diagnostic contains:
    logger.atInfo().log("hello %s %s", xs);
  }
}
