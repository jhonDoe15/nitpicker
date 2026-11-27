import com.google.common.flogger.FluentLogger;

class F43Fl1 {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();

  public void f(Exception e, Throwable t) {
    // BUG: Diagnostic contains: 'java.lang.String' cannot be formatted using '%d'
    logger.atInfo().log("hello %d", "world");
  }
}
