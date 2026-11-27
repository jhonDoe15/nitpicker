import com.google.common.flogger.FluentLogger;

class F43Fl2 {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();

  public void f(Exception e, Throwable t) {
    // BUG: Diagnostic contains: logger.atInfo().withCause(e).log("hello");
    logger.atInfo().log("hello", e);
    // BUG: Diagnostic contains: logger.atInfo().withCause(t).log("hello %s", e);
    logger.atInfo().log("hello %s", e, t);
  }
}
