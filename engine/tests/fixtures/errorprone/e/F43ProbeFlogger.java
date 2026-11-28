import com.google.common.flogger.FluentLogger;
import com.google.common.flogger.LazyArg;
import static com.google.common.flogger.LazyArgs.lazy;

class F43ProbeFlogger {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();

  void f(Exception e, RuntimeException r, LazyArg<Integer> lazyInt, LazyArg<?> wild, Object o) {
    logger.atInfo().log("hello %s", 1, e);
    logger.atInfo().log("hello", e);
    logger.atInfo().withCause(r).log("hello", e);
    logger.atInfo().log("hello %d", "x");
    logger.atInfo().log("hello %d", lazyInt);
    logger.atInfo().log("hello %d", wild);
    logger.atInfo().log("hello %s %s", o);
    logger.atInfo().log("%s", (Object) e, e);
    logger.atSevere().log("x %s y", 1, (e));
  }
}
