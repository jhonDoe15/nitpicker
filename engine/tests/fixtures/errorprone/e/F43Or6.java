import com.google.common.flogger.FluentLogger;

class F43Or6 {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();

  public void f() {
    // BUG: Diagnostic contains:
    logger.atInfo().log("hello %d");
  }
}
