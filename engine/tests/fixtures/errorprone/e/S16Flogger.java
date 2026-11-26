import com.google.common.flogger.AbstractLogger;
import com.google.common.flogger.FluentLogger;
import java.util.concurrent.TimeUnit;

class S16Flogger {
  enum Key {
    A
  }

  static final class Logger extends AbstractLogger<FluentLogger.Api> {}

  private static final FluentLogger logger = FluentLogger.forEnclosingClass();
  private static final FluentLogger other = FluentLogger.forEnclosingClass();
  private final Logger own = new Logger();

  FluentLogger getLogger() {
    return logger;
  }

  void per() {
    logger.atInfo().per(Key.A).log("x");
    logger.atInfo().per(Key.A).atMostEvery(1, TimeUnit.SECONDS).log("x");
    logger.atInfo().atMostEvery(1, TimeUnit.SECONDS).per(Key.A).log("x");
    logger.atInfo().per(Key.A).every(2).log("x");
    logger.atInfo().per(Key.A).onAverageEvery(2).log("x");
    logger.atInfo().per(Key.A).per(Key.A).log("x");
    logger.atInfo().log("x");
    logger.atInfo().per(Key.A).isEnabled();
    own.atSevere().per(Key.A).log("x");
  }

  @SuppressWarnings("FloggerPerWithoutRateLimit")
  void perSuppressed() {
    logger.atInfo().per(Key.A).log("x");
  }

  void cause() {
    try {
      System.out.hashCode();
    } catch (Exception e) {
      own.atWarning().log("failed");
    }
    try {
      System.out.hashCode();
    } catch (Exception e) {
      own.atSevere().log("failed");
    }
    try {
      System.out.hashCode();
    } catch (Exception e) {
      own.atSevere().log("failed: %s", e);
    }
    try {
      System.out.hashCode();
    } catch (Exception e) {
      own.atSevere().withCause(e).log("failed");
    }
    try {
      System.out.hashCode();
    } catch (Exception e) {
      logger.atWarning().log("failed");
    }
    try {
      System.out.hashCode();
    } catch (Exception e) {
      own.atSevere().log("failed");
      own.atSevere().log("again");
    }
    try {
      System.out.hashCode();
    } catch (Exception e) {
      own.atInfo().log("failed");
    }
    try {
      System.out.hashCode();
    } catch (@SuppressWarnings("FloggerLogWithCause") Exception e) {
      own.atSevere().log("failed");
    }
    try {
      System.out.hashCode();
    } catch (Exception e) {
      Runnable r =
          () -> {
            Exception e2 = null;
          };
      own.atSevere().log("failed");
    }
    try {
      System.out.hashCode();
    } catch (Exception e) {
      new Object() {
        void f(Exception e) {
          own.atSevere().log("failed " + e);
        }
      };
    }
  }

  void enabled(boolean flag) {
    if (logger.atInfo().isEnabled()) {
      logger.atInfo().log("test");
    }
    if (flag) {
      if (logger.atInfo().isEnabled()) {
        logger.atInfo().log("test");
      }
    }
    if (7 == 7 && logger.atInfo().isEnabled()) {
      logger.atInfo().log("test");
    }
    if (logger.atInfo().isEnabled() && 7 == 7) {
      logger.atInfo().log("test");
    }
    if (7 == 7 && (logger != null && logger.atInfo().isEnabled())) {
      logger.atInfo().log("test");
    }
    if (!logger.atInfo().isEnabled()) {
      logger.atInfo().log("test");
    }
    if (!logger.atInfo().isEnabled() && 7 == 7) {
      logger.atInfo().log("test");
    }
    if (logger.atConfig().isEnabled()) {
      logger.atConfig().log("test");
    }
    if (logger.atWarning().isEnabled()) {
      logger.atWarning().log("test");
    }
    if (logger.atSevere().isEnabled()) {
      {
        logger.atSevere().log("test");
      }
    }
    if (getLogger().atInfo().isEnabled()) {
      getLogger().atInfo().log("test");
    }
    if (this.getLogger().atInfo().isEnabled()) {
      getLogger().atInfo().log("test");
    }
    if (flag && logger.atInfo().isEnabled() || (flag && logger.atInfo().isEnabled())) {
      logger.atInfo().log("test");
    }
    if (flag && (logger.atInfo().isEnabled())) {
      logger.atInfo().log("test");
    }
    if (((logger.atInfo().isEnabled()))) logger.atInfo().log("test");
  }

  void notEnabled(boolean flag) {
    if (logger.atInfo().isEnabled()) {
      logger.atWarning().log("test");
    }
    if (logger.atInfo().isEnabled()) {
      other.atInfo().log("test");
    }
    if (logger.atInfo().isEnabled()) {
      logger.atInfo().log("test");
    } else {
      flag = false;
    }
    if (logger.atInfo().isEnabled()) {
      logger.atInfo().log("test");
      logger.atInfo().log("again");
    }
    if (flag) {
      logger.atInfo().log("test");
    }
    if (logger.atInfo().isEnabled()) {
      flag = true;
    }
    if (flag && logger.atFine().isEnabled()) {
      logger.atInfo().log("test");
    }
    if (logger.atInfo().isEnabled() && own.atInfo().isEnabled()) {
      logger.atInfo().log("test");
    }
    if (logger.atInfo().isEnabled() == flag) {
      logger.atInfo().log("test");
    }
  }

  @SuppressWarnings("FloggerRedundantIsEnabled")
  void enabledSuppressed() {
    if (logger.atInfo().isEnabled()) {
      logger.atInfo().log("test");
    }
  }
}
