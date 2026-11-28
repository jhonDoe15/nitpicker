import com.google.common.flogger.FluentLogger;

class S24Flogger {
  static class Holder {
    public FluentLogger logger;

    public FluentLogger get() {
      return logger;
    }
  }

  static class Negative {
    private static final FluentLogger logger = FluentLogger.forEnclosingClass();

    public void log(FluentLogger l) {
      l.atInfo().log("bland");
    }

    public void delegate(Holder h) {
      h.logger.atInfo().log("held");
    }

    public void read(Holder h) {
      h.get().atInfo().log("got");
    }
  }

  static class AddsStatic {
    final FluentLogger logger = FluentLogger.forEnclosingClass();
  }

  static class ExtractsExpression {
    void doIt() {
      FluentLogger.forEnclosingClass().atInfo().log();
    }
  }

  static class ExtractsTwice {
    void doIt() {
      FluentLogger.forEnclosingClass().atInfo().log();
      FluentLogger.forEnclosingClass().atInfo().log();
    }
  }

  static class NoSelfAssignment {
    private static final FluentLogger logger;

    static {
      logger = register(FluentLogger.forEnclosingClass());
    }

    private static <T> T register(T t) {
      return t;
    }
  }

  static class NoIndirectWrappers {
    private static FluentLogger logger = register(FluentLogger.forEnclosingClass());

    private static <T> T register(T t) {
      return t;
    }
  }

  static class A {
    public A() {
      B.logger.atInfo().log();
    }
  }

  static class B {
    private static final FluentLogger logger = FluentLogger.forEnclosingClass();
  }

  interface HidesLogger {
    static FluentLogger logger = FluentLogger.forEnclosingClass();

    default void foo() {
      logger.atInfo().log();
    }
  }

  interface ExtractsHidden {
    default void foo() {
      FluentLogger.forEnclosingClass().atInfo().log();
    }
  }

  static class FixesVisibility {
    public static final FluentLogger logger = FluentLogger.forEnclosingClass();
  }

  static class GoalsDontConflict {
    public FluentLogger logger = FluentLogger.forEnclosingClass();
  }

  static class Parent {
    @SuppressWarnings("FloggerRequiredModifiers")
    protected static final FluentLogger logger = FluentLogger.forEnclosingClass();
  }

  static class Child extends Parent {
    Child() {
      logger.atInfo().log("child");
      super.logger.atInfo().log("super");
      Parent.logger.atInfo().log("parent");
    }
  }

  static class SelfReference extends Parent {
    private static final FluentLogger logger = Parent.logger;

    SelfReference() {
      logger.atInfo().log("child");
    }
  }

  @SuppressWarnings("FloggerRequiredModifiers")
  static class Suppressed {
    FluentLogger logger = FluentLogger.forEnclosingClass();

    void doIt() {
      FluentLogger.forEnclosingClass().atInfo().log();
    }
  }

  static class StaticOnly {
    static FluentLogger logger = FluentLogger.forEnclosingClass();
  }

  static class ProtectedFinal {
    protected final FluentLogger logger = FluentLogger.forEnclosingClass();
  }

  static class Local {
    void doIt() {
      FluentLogger local = FluentLogger.forEnclosingClass();
      local.atInfo().log();
    }
  }
}

interface S24FloggerParent {}

interface S24FloggerChild extends S24FloggerParent {
  static final FluentLogger logger = FluentLogger.forEnclosingClass();

  default void go() {
    logger.atInfo().log();
  }
}

interface S24FloggerSibling extends S24FloggerParent {
  static final FluentLogger logger = FluentLogger.forEnclosingClass();

  default void go() {
    logger.atInfo().log();
    S24FloggerChild.logger.atInfo().log();
  }
}
