package e;

import java.util.function.Supplier;

class B7Nested {
  private static class Unused1 {}

  private static class Dead {}

  /** Documented. */
  private static class DeadDoc {
    int x;
  }

  // plain comment
  private class DeadInner {
    void m() {}
  }

  private static class Live {
    static int VALUE = 1;
  }

  private static class LiveByMember {
    static int count() {
      return 1;
    }
  }

  private static class LiveByMember2 {
    int field;
  }

  private static class OnlySelf {
    OnlySelf make() {
      return new OnlySelf();
    }
  }

  private enum DeadEnum {
    A,
    B
  }

  private interface DeadInterface {}

  private record DeadRecord(int x) {}

  private static class Outer2 {
    private static class Inner2 {}
  }

  private static class UsedViaInner {
    static class Nested {
      static int x = 1;
    }
  }

  @SuppressWarnings("UnusedNestedClass")
  private static class Suppressed {}

  @SuppressWarnings("unused")
  private static class SuppressedUnused {}

  @interface Keep {}

  @Keep
  private static class Kept {}

  static class NotPrivate {}

  private static class Base {}

  private static class Derived extends Base {}

  int use(LiveByMember2 other) {
    Supplier<Integer> s = LiveByMember::count;
    int a = Live.VALUE + UsedViaInner.Nested.x;
    return a + other.field + s.get();
  }

  void locals() {
    class LocalDead {}
    class LocalLive {}
    LocalLive l = new LocalLive();
    new Derived();
  }
}
