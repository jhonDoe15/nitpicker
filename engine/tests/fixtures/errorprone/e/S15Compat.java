package e;

import com.google.errorprone.annotations.CompatibleWith;

class S15Compat<X> {
  static final String CONSTANT = "X";
  static final String OTHER = "Y";

  void ok(@CompatibleWith("X") Object ok) {}

  void okConstant(@CompatibleWith(CONSTANT) Object ok) {}

  <Y extends String> void okMethod(@CompatibleWith("Y") Object ok) {}

  <X, Z> void okTwice(@CompatibleWith("X") Object ok) {}

  void okVarargs(@CompatibleWith("X") Object... ok) {}

  void okNamed(@CompatibleWith(value = "X") Object ok) {}

  void bad(@CompatibleWith("Y") Object bad) {}

  void badConstant(@CompatibleWith(OTHER) Object bad) {}

  void badEmpty(@CompatibleWith("") Object bad) {}

  <Z> void badMethod(@CompatibleWith("Y") Object bad) {}

  void badNamed(@CompatibleWith(value = "W") Object bad) {}

  void badConcatenated(@CompatibleWith("X" + "Y") Object bad) {}

  void badLowercase(@CompatibleWith("x") Object bad) {}

  @SuppressWarnings("CompatibleWithAnnotationMisuse")
  void suppressed(@CompatibleWith("Y") Object bad) {}

  static class Child<X> extends S15Compat<X> {
    @Override
    void ok(@CompatibleWith("X") Object ok) {}

    @Override
    void okConstant(Object ok) {}
  }

  static class Plain {
    void none(@CompatibleWith("Y") Object bad) {}

    <T> void method(@CompatibleWith("T") Object ok, @CompatibleWith("Q") Object bad) {}
  }

  class Inner<Y> {
    class Deep<Z> {
      void doSomething(@CompatibleWith("P") Object bad) {}

      <Q> void doSomethingElse(@CompatibleWith("P") Object bad) {}
    }
  }

  static class Nested<Y> {
    class Deep<Z> {
      void doSomething(@CompatibleWith("X") Object bad) {}

      <Q> void doSomethingElse(@CompatibleWith("X") Object bad) {}
    }

    static class StaticDeep<Z> {
      void doSomething(@CompatibleWith("Y") Object bad) {}
    }
  }

  interface Contract<T> {
    void accept(@CompatibleWith("T") Object ok, @CompatibleWith("U") Object bad);
  }

  static class Implementation implements Contract<String> {
    @Override
    public void accept(Object ok, Object bad) {}
  }

  static class Implementation2 implements Contract<String> {
    @Override
    public void accept(@CompatibleWith("Z") Object ok, Object bad) {}
  }

  void anonymous() {
    new Object() {
      <W> void inAnonymous(@CompatibleWith("W") Object ok, @CompatibleWith("X") Object fine, @CompatibleWith("Z") Object bad) {}
    };
  }

  static void staticContext() {
    new Object() {
      <W> void inAnonymous(@CompatibleWith("X") Object bad) {}
    };
    class Local<L> {
      void inLocal(@CompatibleWith("X") Object bad, @CompatibleWith("L") Object ok) {}
    }
  }
}
