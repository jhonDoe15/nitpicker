package e;

import java.util.List;
import java.util.function.Function;

public class B4UnusedTypeParameter {
  static final class FinalClass<T> {}

  static final class FinalUsed<T> {
    T value;
  }

  static final class FinalTwo<A, B> {
    A a;
  }

  static final class FinalThree<A, B, C> {
    B b;
  }

  static class NotFinal<T> {}

  record Rec<T>(int a) {}

  record RecUsed<T>(T a) {}

  enum En { X }

  <T> void unusedMethod() {}

  <T> void usedMethod(T t) {}

  <T extends Comparable<T>> void selfBound() {}

  <A, B extends A> void boundUse() {}

  <A, B> void second(A a) {}

  <A, B> void first(B b) {}

  static <T> void staticUnused() {}

  private <T> void privateUnused() {}

  final <T> void finalUnused() {}

  public <T> void overridable() {}

  <T> B4UnusedTypeParameter(int x) {}

  <T> B4UnusedTypeParameter() {}

  static <T> List<String> inReturn() {
    return null;
  }

  static <T> void inBody() {
    List<T> list = null;
  }

  static <T> void inCast(Object o) {
    Object x = (List<T>) o;
  }

  static <T> void inCall() {
    B4UnusedTypeParameter.<T>staticUnused();
  }

  static <T> void shadow() {
    class Local {
      <T> T id(T t) {
        return t;
      }
    }
  }

  static <T extends Comparable<T>, U> void multi(U u) {}

  @SuppressWarnings("UnusedTypeParameter")
  static <T> void suppressed() {}

  @Override
  public String toString() {
    return "";
  }

  interface Iface {
    <T> void abstractMethod();

    default <T> void defaulted() {}

    static <T> void stat() {}

    private <T> void priv() {}
  }

  static class Impl implements Iface {
    public <T> void abstractMethod() {}
  }

  static final class FinalOwner {
    <T> void inFinal() {}
  }

  Object anon = new Object() {
    <T> void inAnon() {}
  };

  enum WithBody {
    A {
      <T> void m() {}
    };
    <T> void n() {}
  }
}
