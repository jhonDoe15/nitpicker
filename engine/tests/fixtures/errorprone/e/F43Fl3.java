import com.google.common.flogger.FluentLogger;

class F43Fl3 {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();

  public void f(Exception e, Throwable t, String s) {
    logger.atInfo().withCause(e).log("hello %s", e);
  }
}
