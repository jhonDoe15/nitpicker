package e;

import java.util.Objects;

class B6Equality {
  static class OnlyEquals {
    int x;

    @Override
    public boolean equals(Object o) {
      if (!(o instanceof OnlyEquals)) {
        return false;
      }
      return x == ((OnlyEquals) o).x;
    }
  }

  static class BothOverridden {
    int x;

    @Override
    public boolean equals(Object o) {
      return o instanceof BothOverridden && x == ((BothOverridden) o).x;
    }

    @Override
    public int hashCode() {
      return x;
    }
  }

  static class DelegatingEquals {
    @Override
    public boolean equals(Object o) {
      return super.equals(o);
    }
  }

  static class InheritedHash extends BothOverridden {
    @Override
    public boolean equals(Object o) {
      return o instanceof InheritedHash && x == 1;
    }
  }

  static class SuppressedOnMethod {
    @SuppressWarnings("EqualsHashCode")
    @Override
    public boolean equals(Object o) {
      return o == this;
    }
  }

  @SuppressWarnings("EqualsHashCode")
  static class SuppressedOnClass {
    @Override
    public boolean equals(Object o) {
      return o == this;
    }
  }

  interface InterfaceWithEquals {
    boolean equals(Object o);
  }

  enum EnumWithEquals {
    A;
  }

  record RecordWithEquals(int x) {
    @Override
    public boolean equals(Object o) {
      return o == this;
    }
  }

  static abstract class AbstractHash {
    @Override
    public abstract int hashCode();
  }

  static class SubAbstract extends AbstractHash {
    @Override
    public int hashCode() {
      return 1;
    }

    @Override
    public boolean equals(Object o) {
      return o == this;
    }
  }

  static class ThreeEquals {
    @Override
    public boolean equals(Object o) {
      return false;
    }

    public boolean equals(String o) {
      return true;
    }
  }

  static class InnerAnon {
    Object o = new Object() {
      @Override
      public boolean equals(Object other) {
        return other == this;
      }
    };
  }

  static class HashCodeEquality {
    int h;

    @Override
    public int hashCode() {
      return h;
    }

    @Override
    public boolean equals(Object o) {
      return o != null && hashCode() == o.hashCode();
    }
  }

  static class HashCodeBoth {
    int h;

    @Override
    public int hashCode() {
      return h;
    }

    @Override
    public boolean equals(Object o) {
      return hashCode() == o.hashCode();
    }
  }

  static class HashCodeNotLast {
    int h;

    @Override
    public int hashCode() {
      return h;
    }

    @Override
    public boolean equals(Object o) {
      boolean same = o.hashCode() == hashCode();
      return same;
    }
  }

  static class HashCodeArgument {
    int h;

    @Override
    public int hashCode() {
      return h;
    }

    @Override
    public boolean equals(Object o) {
      return Objects.equals(o.hashCode(), h) && Integer.valueOf(1).equals(o.hashCode());
    }
  }

  static class HashCodeOtherMethod {
    int h;

    @Override
    public int hashCode() {
      return h;
    }

    boolean other(Object o) {
      return hashCode() == o.hashCode();
    }
  }

  static class HashCodeInLambda {
    int h;

    @Override
    public int hashCode() {
      return h;
    }

    @Override
    public boolean equals(Object o) {
      java.util.function.Supplier<Boolean> s = () -> {
        return o.hashCode() == 1;
      };
      return s.get() && o.hashCode() > 2 ? true : o.hashCode() == 3;
    }
  }

  static class HashCodeStaticMethod {
    @Override
    public int hashCode() {
      return 1;
    }

    @Override
    public boolean equals(Object o) {
      return Objects.hashCode(o) == hashCode() && Objects.hash(o) == 1;
    }
  }

  static class ThrowingEquals extends RuntimeException {
    @Override
    public boolean equals(Object o) {
      return o == this;
    }

    @Override
    public int hashCode() {
      return 1;
    }

    public boolean equals(String s) {
      return false;
    }
  }

  static class Exc2 extends Exception {
    // comment before
    @Override
    public boolean equals(Object o) {
      return o == this;
    }

    private int field;
  }

  static class Err extends Error {
    @Override
    public int hashCode() {
      return 2;
    }
  }

  static class InnerThrowable {
    class Inside extends Throwable {
      @Override
      public int hashCode() {
        return 3;
      }
    }
  }

  static class TrivialSuperEquals {
    @Override
    public boolean equals(Object o) {
      return super.equals(o);
    }
  }

  static class CovariantPublic {
    public boolean equals(CovariantPublic o) {
      return o != null;
    }

    @Override
    public boolean equals(Object o) {
      return o instanceof CovariantPublic && equals((CovariantPublic) o);
    }

    @Override
    public int hashCode() {
      return 0;
    }
  }

  static class CovariantNoOverride {
    int v;

    public boolean equals(CovariantNoOverride o) {
      return o != null && o.v == v;
    }
  }

  static class CovariantAnnotated {
    int v;

    @Deprecated
    public boolean equals(CovariantAnnotated other) {
      if (other == null) {
        return false;
      }
      return other.v == v && this.v == other.v;
    }
  }

  static class CovariantStatic {
    public static boolean equals(CovariantStatic a, CovariantStatic b) {
      return a == b;
    }

    static boolean equals(CovariantStatic a) {
      return a == null;
    }
  }

  static class CovariantPrivate {
    private boolean equals(CovariantPrivate o) {
      return o == this;
    }
  }

  static class CovariantBoxed {
    public Boolean equals(CovariantBoxed o) {
      return Boolean.TRUE;
    }
  }

  static class CovariantAbstractBody {
    abstract static class Base {
      public abstract boolean equals(Base other);
    }
  }

  enum CovariantEnum {
    A, B;

    public boolean equals(CovariantEnum other) {
      return other == this;
    }
  }

  static class CovariantGeneric<T> {
    public boolean equals(CovariantGeneric<T> other) {
      return other != null;
    }
  }

  static class CovariantInt {
    public boolean equals(int other) {
      return other == 1;
    }

    public boolean equals(Object a, Object b) {
      return a == b;
    }

    public int equals(String s) {
      return 1;
    }
  }

  static class TabIndented {
	public boolean equals(TabIndented other) {
		return false;
	}
  }
}
