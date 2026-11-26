package e;

import com.google.common.truth.FailureMetadata;
import com.google.common.truth.Subject;

class S24TruthChaining {
  static final class FooSubject extends Subject {
    private final Foo actual;

    private FooSubject(FailureMetadata metadata, Foo actual) {
      super(metadata, actual);
      this.actual = actual;
    }

    void hasString(String expected) {
      if (!actual.string().equals(expected)) {
        failWithActual("expected to have string", expected);
      }
    }

    void guava(String expected) {
      if (!com.google.common.base.Objects.equal(actual.string(), expected)) {
        failWithActual("expected to have string", expected);
      }
    }

    void javaObjects(String expected) {
      if (!java.util.Objects.equals(actual.string(), expected)) {
        failWithActual("expected to have string", expected);
      }
    }

    void hasInteger(int expected) {
      if (actual.integer() != expected) {
        failWithActual("expected to have integer", expected);
      }
    }

    void hasKind(Kind expected) {
      if (actual.kind() != expected) failWithActual("expected to have kind", expected);
    }

    void nested(int expected) {
      if (this.actual.otherFoo().integer() != expected) {
        failWithoutActual("expected to have other");
      }
    }

    void viaActualMethod(int expected) {
      if (((Foo) actual()).integer() != expected) {
        failWithActual("x", expected);
      }
    }

    void viaThisActual(int expected) {
      if (!(this.actual.integer() == expected ? false : true)) {
        failWithActual("x", expected);
      }
    }

    @SuppressWarnings("ImplementAssertionWithChaining")
    void suppressed(int expected) {
      if (actual.integer() != expected) {
        failWithActual("x", expected);
      }
    }

    void doesNotHaveString(String other) {
      if (actual.string().equals(other)) {
        failWithActual("expected not to have string", other);
      }
    }

    void doesNotHaveInteger(int other) {
      if (actual.integer() == other) {
        failWithActual("expected not to have integer", other);
      }
    }

    void boxed(Integer expected) {
      if (actual.boxedInteger() != expected) {
        failWithActual("expected to have boxed integer", expected);
      }
    }

    void withElse(int expected) {
      if (actual.integer() != expected) {
        failWithActual("x", expected);
      } else {
        failWithActual("y", expected);
      }
    }

    void twoStatements(int expected) {
      if (actual.integer() != expected) {
        failWithActual("x", expected);
        failWithActual("y", expected);
      }
    }

    void notAFail(int expected) {
      if (actual.integer() != expected) {
        helper();
      }
    }

    void qualifiedFail(int expected, FooSubject other) {
      if (actual.integer() != expected) {
        other.failWithActual("x", expected);
      }
    }

    void withArguments(int expected) {
      if (actual.add(1) != expected) {
        failWithActual("x", expected);
      }
    }

    void backwards(int expected) {
      if (expected != actual.integer()) {
        failWithActual("x", expected);
      }
    }

    void notActual(Foo other, int expected) {
      if (other.integer() != expected) {
        failWithActual("x", expected);
      }
    }

    void otherName(Foo foo, int expected) {
      if (!foo.string().equals("a")) {
        failWithActual("x", expected);
      }
    }

    void helper() {}
  }

  static class NotSubject {
    private final Foo actual = null;

    void check(int expected) {
      if (actual.integer() != expected) {
        failWithActual("x", expected);
      }
    }

    void failWithActual(String a, Object b) {}
  }

  private static final class Foo {
    String string() {
      return "";
    }

    int integer() {
      return 1;
    }

    int add(int x) {
      return x;
    }

    Integer boxedInteger() {
      return 1;
    }

    Kind kind() {
      return null;
    }

    Foo otherFoo() {
      return this;
    }
  }

  private enum Kind {}
}
