import com.google.common.flogger.FluentLogger;

class F43Or7 {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();

  public void f(String arg) {
    logger.atInfo().log("hello %d", arg);
  }
}
