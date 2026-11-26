package e;

import com.google.common.flogger.AbstractLogger;
import com.google.common.flogger.FluentLogger;
import com.google.common.flogger.LoggingApi;
import java.util.List;
import java.util.function.Function;

class S14FloggerSplit {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();
  FluentLogger.Api field;
  static FluentLogger.Api staticField;

  FluentLogger.Api getLogger() {
    return logger.atInfo();
  }

  void splitLog() {
    FluentLogger.Api api = logger.atInfo();
    api.log("foo");
  }

  void splitLogVar() {
    var api = logger.atInfo();
    api.log("foo");
  }

  void parameter(FluentLogger.Api api) {
    api.log("foo");
  }

  void catchLike(List<FluentLogger.Api> apis, FluentLogger.Api[] array) {
    for (FluentLogger.Api each : apis) {
      each.log();
    }
    for (var each : apis) {
      each.log();
    }
    FluentLogger.Api[] locals = array;
    Function<FluentLogger.Api, Object> function = (FluentLogger.Api typed) -> null;
    Function<FluentLogger.Api, Object> inferred = untyped -> null;
  }

  void log() {
    logger.atInfo().log("foo");
  }

  <A extends LoggingApi<A>> A generic(A api) {
    return api;
  }

  LoggingApi<?> wildcard() {
    return null;
  }

  Object anonymous() {
    return new Object() {
      FluentLogger.Api inner() {
        return logger.atInfo();
      }
    };
  }

  @SuppressWarnings("FloggerSplitLogStatement")
  FluentLogger.Api suppressed() {
    FluentLogger.Api api = logger.atInfo();
    return api;
  }

  static class OtherLogger extends AbstractLogger<FluentLogger.Api> {
    FluentLogger.Api method() {
      FluentLogger.Api api = atInfo();
      return api;
    }
  }

  interface Api2 extends LoggingApi<Api2> {
    Api2 chained();

    default Api2 twice() {
      Api2 self = chained();
      return self;
    }
  }

  abstract static class ImplementsApi implements LoggingApi<ImplementsApi> {
    ImplementsApi next() {
      ImplementsApi local = this;
      return local;
    }
  }
}
