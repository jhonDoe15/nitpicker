import com.google.common.flogger.FluentLogger;

class S22Flogger {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();

  void withoutCause(Exception e, Throwable t, RuntimeException r, String text) {
    logger.atInfo().log("message %s", e);
    logger.atInfo().log("message %s %s", text, t);
    logger.atInfo().log("message %s %s", r, text);
    logger.atInfo().withCause(e).log("message %s", e);
    logger.atInfo().log("message %s", text);
    logger.atInfo().log("message");
    logger.atInfo().log("message %s", (Object) null);
    logger.atInfo().log("message %s", e.getMessage());
  }

  @SuppressWarnings("FloggerWithoutCause")
  void suppressedWithout(Exception e) {
    logger.atInfo().log("message %s", e);
  }

  void withCause(Exception e, Throwable t, String s) {
    logger.atInfo().withCause(new Exception()).log("a");
    logger.atInfo().withCause(new RuntimeException()).log("a");
    logger.atInfo().withCause(new Throwable()).log("a");
    logger.atInfo().withCause(new IllegalStateException()).log("a");
    logger.atInfo().withCause(new AssertionError()).log("a");
    logger.atInfo().withCause(new Error()).log("a");
    logger.atInfo().withCause(new IllegalArgumentException()).log("a");
    logger.atInfo().withCause(new Exception(e)).log("a");
    logger.atInfo().withCause(new Exception("message", t)).log("a");
    logger.atInfo().withCause(new RuntimeException(e.getMessage())).log("a");
    logger.atInfo().withCause(new RuntimeException(t.toString())).log("a");
    logger.atInfo().withCause(new RuntimeException((Throwable) null)).log("a");
    logger.atInfo().withCause(new RuntimeException("message")).log("a");
    logger.atInfo().withCause(new UnsupportedOperationException()).log("a");
    logger.atInfo().withCause(new Exception() {}).log("a");
    logger.atInfo().withCause((new Exception())).log("a");
    logger.atInfo().withCause(e).log("a");
    logger.atInfo().withCause(new Exception(s)).log("a");
  }

  @SuppressWarnings("FloggerWithCause")
  void suppressedWith() {
    logger.atInfo().withCause(new Exception()).log("a");
  }
}
