import java.util.function.Supplier;

public class B3Deadlock {
  private static Object cycle = new B();
  static Object constant = 1;
  Object nonStatic = new B();
  static Class<?> classLiteral = B.class;
  private static Object anon =
      new Object() {
        void f() {
          new B();
        }
      };
  static Object viaScoped = new B3Deadlock.B();
  static Supplier<Object> lambda = () -> new B();

  static {
    Object o = new B();
  }

  @SuppressWarnings("ClassInitializationDeadlock")
  static Object suppressed = new B();

  public static class B extends B3Deadlock {}

  private static Object benign = new P.C();

  private static class P {
    public static class C extends B3Deadlock {}
  }
}

interface B3DeadlockI {
  Object cycle = new B();

  default void f() {}

  public static class B implements B3DeadlockI {}
}

interface B3DeadlockJ {
  Object cycle = new B();

  public static class B implements B3DeadlockJ {}
}

class B3DeadlockPriv {
  private static Object cycle = new B();

  public static final class B extends B3DeadlockPriv {
    private B() {}
  }
}

class B3DeadlockFactory {
  private static Object cycle = new B();

  public static final class B extends B3DeadlockFactory {
    private B() {}

    public static B create() {
      return new B();
    }
  }
}

class B3DeadlockInner {
  private static Object cycle = new B3DeadlockInner().new B();

  public class B extends B3DeadlockInner {}
}

enum B3DeadlockE {
  ONE(0),
  TWO {
    void f() {}
  };

  B3DeadlockE(int x) {}

  B3DeadlockE() {}
}
